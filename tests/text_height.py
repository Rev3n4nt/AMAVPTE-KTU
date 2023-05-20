# Text height
import cv2
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'lib'))
import amavpte  # nopep8


screen_height = 135  # mm. average 6'' screen
min_text_height = 3  # mm

for i in range(1, len(sys.argv)):
    file_path = sys.argv[i]

    img = cv2.imread(file_path)
    text_pieces = amavpte.find_text_pieces(img)

    image_height = len(img)

    for (bb, piece) in text_pieces:
        piece_height = len(piece)
        text_height_mm = screen_height * piece_height / image_height

        if text_height_mm < min_text_height:
            amavpte.report_problem(
                file_path,
                'text height too small ' +
                f'({text_height_mm} mm)',
                bb)
