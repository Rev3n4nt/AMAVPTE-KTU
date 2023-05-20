from os import path
import json
import re
import subprocess
import unittest

bb_tolerance = 10 #px
re_text_height = re.compile(r'^text height too small')
re_background_saturation = re.compile(r'^background color is too saturated')
re_text_contrast_low = re.compile(r'^contrast between text and background is too low')
re_text_contrast_high = re.compile(r'^contrast between text and background is too high')

class Tester(unittest.TestCase):
    def run_test(self, test_image):
        result = subprocess.run(['python', self.script_path(), path.join('test_suite', test_image)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            print(result.stdout)
            print(result.stderr)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, b'')

        problems = []
        for line in result.stdout.split(b'\n'):
            if line == b'': break
            problems.append(json.loads(line))

        return problems

    def assertBoundingBox(self, problem, bb_expected):
        bb_got = problem['bounding_box']
        self.assertLessEqual(abs(bb_expected['x'] - bb_got['x']), bb_tolerance)
        self.assertLessEqual(abs(bb_expected['y'] - bb_got['y']), bb_tolerance)
        self.assertLessEqual(abs(bb_expected['x'] + bb_expected['w'] - bb_got['x'] - bb_got['w']), bb_tolerance)
        self.assertLessEqual(abs(bb_expected['y'] + bb_expected['h'] - bb_got['y'] - bb_got['h']), bb_tolerance)


class TestTextHeight(Tester):
    def script_path(self):
        return path.join('tests', 'text_height.py')

    def test_no_text(self):
        problems = self.run_test('no_text.jpg')
        self.assertEqual(len(problems), 0)

    def test_text_ok(self):
        problems = self.run_test('text_ok.jpg')
        self.assertEqual(len(problems), 0)

    def test_text_small(self):
        problems = self.run_test('text_small.jpg')
        self.assertEqual(len(problems), 1)
        self.assertRegex(problems[0]['message'], re_text_height)
        self.assertBoundingBox(problems[0], {"x": 15, "y": 105, "w": 937, "h": 48})

    def test_toxic_colors(self):
        problems = self.run_test('toxic_colors.jpg')
        self.assertEqual(len(problems), 0)

    def test_low_contrast(self):
        problems = self.run_test('low_contrast.jpg')
        self.assertEqual(len(problems), 0)


class TestBackground(Tester):
    def script_path(self):
        return path.join('tests', 'background_saturation.py')

    def test_no_text(self):
        problems = self.run_test('no_text.jpg')
        self.assertEqual(len(problems), 0)

    def test_text_ok(self):
        problems = self.run_test('text_ok.jpg')
        self.assertEqual(len(problems), 0)

    def test_text_small(self):
        problems = self.run_test('text_small.jpg')
        self.assertEqual(len(problems), 0)

    def test_toxic_colors(self):
        problems = self.run_test('toxic_colors.jpg')
        self.assertEqual(len(problems), 3)
        self.assertRegex(problems[0]['message'], re_background_saturation)
        self.assertBoundingBox(problems[0], {"x": 15, "y": 679, "w": 1401, "h": 181})
        self.assertRegex(problems[1]['message'], re_background_saturation)
        self.assertBoundingBox(problems[1], {"x": 87, "y": 923, "w": 1267, "h": 183})
        self.assertRegex(problems[2]['message'], re_background_saturation)
        self.assertBoundingBox(problems[2], {"x": 203, "y": 1169, "w": 1033, "h": 181})

    def test_low_contrast(self):
        problems = self.run_test('low_contrast.jpg')
        self.assertEqual(len(problems), 0)

class TestContrast(Tester):
    def script_path(self):
        return path.join('tests', 'text_contrast.py')

    def test_no_text(self):
        problems = self.run_test('no_text.jpg')
        self.assertEqual(len(problems), 0)

    def test_text_ok(self):
        problems = self.run_test('text_ok.jpg')
        self.assertEqual(len(problems), 2)
        self.assertRegex(problems[0]['message'], re_text_contrast_high)
        self.assertBoundingBox(problems[0], {"x": 14, "y": 123, "w": 1355, "h": 80})
        self.assertRegex(problems[1]['message'], re_text_contrast_high)
        self.assertBoundingBox(problems[1], {"x": 22, "y": 211, "w": 309, "h": 80})

    def test_text_small(self):
        problems = self.run_test('text_small.jpg')
        self.assertEqual(len(problems), 0)

    def test_toxic_colors(self):
        problems = self.run_test('toxic_colors.jpg')
        self.assertEqual(len(problems), 0)

    def test_low_contrast(self):
        problems = self.run_test('low_contrast.jpg')
        self.assertEqual(len(problems), 3)
        self.assertRegex(problems[0]['message'], re_text_contrast_low)
        self.assertBoundingBox(problems[0], {"x": 16, "y": 713, "w": 1399, "h": 180})
        self.assertRegex(problems[1]['message'], re_text_contrast_low)
        self.assertBoundingBox(problems[1], {"x": 88, "y": 957, "w": 1265, "h": 181})
        self.assertRegex(problems[2]['message'], re_text_contrast_low)
        self.assertBoundingBox(problems[2], {"x": 204, "y": 1203, "w": 1031, "h": 179})


if __name__ == '__main__':
    unittest.main()
