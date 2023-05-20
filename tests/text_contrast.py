# Text contrast
import cv2
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'lib'))
import amavpte  # nopep8


for i in range(1, len(sys.argv)):
    file_path = sys.argv[i]

    img = cv2.imread(file_path)
    text_pieces = amavpte.find_text_pieces(img)

    image_height = len(img)

    for (bb, piece) in text_pieces:
        (x, y, w, h) = bb
        text_color, background_color = amavpte.extract_text_color(
            piece, img[y:y+h, x:x+w])

        text_h, text_s, text_p = amavpte.RGBtoHSP(
            text_color[0] / 255.0,
            text_color[1] / 255.0,
            text_color[2] / 255.0)
        background_h, background_s, background_p = amavpte.RGBtoHSP(
            background_color[0] / 255.0,
            background_color[1] / 255.0,
            background_color[2] / 255.0)
        contrast = abs(background_p - text_p)
        if contrast < 0.2:
            amavpte.report_problem(
                file_path,
                'contrast between text and background is too low ' +
                f'({contrast})',
                bb)
        if contrast > 0.95:
            amavpte.report_problem(
                file_path,
                'contrast between text and background is too high ' +
                f'({contrast})',
                bb)
