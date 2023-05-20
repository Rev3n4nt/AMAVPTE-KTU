from PIL import Image
from operator import itemgetter
import cv2
import json
import math
import numpy as np
import pytesseract
import re
import sys

def report_problem(image, message, bounding_box):
    print(json.dumps({
        'image': image,
        'message': message,
        'bounding_box': {
            'x': bounding_box[0],
            'y': bounding_box[1],
            'w': bounding_box[2],
            'h': bounding_box[3],
        }
    }))
    sys.stdout.flush()

def contours_near(bb1, bb2):
    (x1, y1, w1, h1) = bb1
    (x2, y2, w2, h2) = bb2
    if y2 > y1 + h1: return False
    if y2 + h2 < y1: return False
    return x2 < x1 + w1 + h1

def contours_merge(bb1, bb2):
    (x1, y1, w1, h1) = bb1
    (x2, y2, w2, h2) = bb2
    x = min(x1, x2)
    y = min(y1, y2)
    x_r = max(x1+w1, x2+w2)
    y_b = max(y1+h1, y2+h2)
    return (x, y, x_r-x, y_b-y)

def looks_like_text(piece):
    text = pytesseract.image_to_string(piece, config="--psm 6")
    text = text.rstrip()

    if len(text) < 2:
        #  print(f'too short: {text}')
        return False

    # at least %50 of characters must be letters/digits
    alnum_count = len(re.findall(r'[a-zA-Z0-9]', text))
    if alnum_count < 0.5 * len(text):
        #  print(f'not a text: {text}')
        return False

    #  print(text)
    #  cv2.imshow('image',piece)
    #  cv2.waitKey(0)
    return True

def find_text_pieces(img):
    img_f = np.array(img, np.float32)
    img_dx = np.c_[ (np.sum(np.diff(img_f, axis=1) ** 2, axis=-1) > 1000) * 1, np.zeros(img.shape[0]) ]
    img_dy = np.r_[ (np.sum(np.diff(img_f, axis=0) ** 2, axis=-1) > 1000) * 1, np.zeros((1, img.shape[1])) ]
    img_c = np.array((img_dx + img_dy > 0) * 255, np.uint8)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(img_c, kernel, iterations=3)

    contours_separate = []
    contours_merged = []

    contours, hierarchy = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        bb = (x, y, w, h) = cv2.boundingRect(contour)
        if w < 10 or h < 10: continue
        contours_separate.append(bb)

    contours_separate = sorted(contours_separate, key=itemgetter(0))

    for i in range(0, len(contours_separate)):
        bb = contours_separate[i]
        if not bb: continue
        for j in range(i+1, len(contours_separate)):
            bb2 = contours_separate[j]
            if not bb2: continue
            if contours_near(bb, bb2):
                bb = contours_merge(bb, bb2)
                contours_separate[j] = None
        contours_merged.append(bb)

    result = []

    for bb in contours_merged:
        (x, y, w, h) = bb
        piece = img_c[y:y+h, x:x+w]
        if looks_like_text(piece):
            result.append((bb, piece))

    return result

def bucket_fill(img, stack, color, replaced_color):
    (h, w) = img.shape
    while (len(stack) > 0):
        (y, x) = stack.pop()
        if x > 0 and img[y, x-1] == replaced_color:
            img[y, x-1] = color
            stack.append((y, x-1))
        if y > 0 and img[y-1, x] == replaced_color:
            img[y-1, x] = color
            stack.append((y-1, x))
        if x < w-1 and img[y, x+1] == replaced_color:
            img[y, x+1] = color
            stack.append((y, x+1))
        if y < h-1 and img[y+1, x] == replaced_color:
            img[y+1, x] = color
            stack.append((y+1, x))

def mark_border(img, color, replaced_color, border_color):
    stack = []
    (h, w) = img.shape
    for y in range(1, h-1):
        for x in range(1, w-1):
            if img[y, x] == replaced_color:
                if img[y, x-1] == border_color or img[y, x+1] == border_color or img[y-1, x] == border_color or img[y+2, x] == border_color:
                    img[y, x] = color
                    stack.append((y, x))
    return stack

def extract_text_color(mask, img):
    OUTER_BACKGROUND = 1
    OUTER_CONTOUR = 2
    TEXT = 3

    mask = np.copy(mask)
    stack = []
    (h, w) = mask.shape
    for y in range(0, h):
        mask[y, 0] = mask[y, w-1] = OUTER_BACKGROUND
        stack.append((y, 0))
        stack.append((y, w-1))
    for x in range(1, w-1):
        mask[0, x] = mask[h-1, x] = OUTER_BACKGROUND
        stack.append((0, x))
        stack.append((h-1, x))
    bucket_fill(mask, stack, OUTER_BACKGROUND, 0)

    stack = mark_border(mask, OUTER_CONTOUR, 255, OUTER_BACKGROUND)
    bucket_fill(mask, stack, OUTER_CONTOUR, 255)

    stack = mark_border(mask, TEXT, 0, OUTER_CONTOUR)
    bucket_fill(mask, stack, TEXT, 0)

    text_pixels = img[mask == TEXT]
    text_mean = np.mean(text_pixels, axis=0)
    text_mean = np.array(text_mean, dtype=np.uint8)

    background_pixels = img[mask == OUTER_BACKGROUND]
    background_mean = np.mean(background_pixels, axis=0)
    background_mean = np.array(background_mean, dtype=np.uint8)

    return (
        (text_mean[2], text_mean[1], text_mean[0]), # BGR -> RGB
        (background_mean[2], background_mean[1], background_mean[0]),
    )

# public domain function by Darel Rex Finley, 2006
# This function expects the passed-in values to be on a scale
# of 0 to 1, and uses that same scale for the return values.
# See description/examples at alienryderflex.com/hsp.html
def RGBtoHSP(r, g, b):
    p = math.sqrt(0.299*r*r + 0.587*g*g + 0.114*b*b)
    if r == g and r== b:
        h = 0
        s = 0
    elif r >= g and r >= b: # r is largest
        if b >= g:
            h = 1 - 1.0/6*(b-g)/(r-g)
            s = 1 - g/r
        else:
            h = 1.0/6*(g-b)/(r-b)
            s = 1 - b/r
    elif g >= r and g >= b: # g is largest
        if r >= b:
            h = 2.0/6 - 1.0/6*(r-b)/(g-b)
            s = 1 - b/g
        else:
            h = 2.0/6 + 1.0/6*(b-r)/(g-r)
            s = 1 - r/g
    else: # b is largest
        if g >= r:
            h = 4.0/6 - 1.0/6*(g-r)/(b-r)
            s = 1 - r/b
        else:
            h = 4.0/6 + 1.0/6*(r-g)/(b-g)
            s = 1 - g/b

    return h, s, p