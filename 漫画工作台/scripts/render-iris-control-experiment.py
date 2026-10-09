"""Render the installed ControlNet annotator's topology/colors for an experiment.

Uses the SD Python environment. Does not modify the annotator or production data.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import cv2
import numpy as np
from mediapipe.framework.formats import landmark_pb2

p = argparse.ArgumentParser()
p.add_argument('--annotator', required=True)
p.add_argument('--input', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
spec = importlib.util.spec_from_file_location('installed_face_renderer', a.annotator)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
d = json.loads(Path(a.input).read_text(encoding='utf-8-sig'))
face = d['faces'][d['plan']['faceIndex']]
crop = d['crop']
lm = landmark_pb2.NormalizedLandmarkList()
targets = {e['irisIndex']: e['normalizedTarget'] for e in d['plan']['eyes']}
for i, point in enumerate(face):
    x, y = (targets[i]['x'], targets[i]['y']) if i in targets else point[:2]
    lm.landmark.add(x=(x*d['width']-crop['left'])/crop['width'],
                    y=(y*d['height']-crop['top'])/crop['height'], z=point[2])
canvas = np.zeros((512, 512, 3), dtype=np.uint8)
renderer.mp_drawing.draw_landmarks(canvas, lm, connections=renderer.face_connection_spec.keys(),
    landmark_drawing_spec=None, connection_drawing_spec=renderer.face_connection_spec)
renderer.draw_pupils(canvas, lm, renderer.iris_landmark_spec, 2)
# Renderer works in BGR; OpenCV's encoder expects that same order.
Path(a.output).write_bytes(cv2.imencode('.png', canvas)[1].tobytes())
