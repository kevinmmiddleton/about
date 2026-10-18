# Models

`magic_touch.tflite` is Google MediaPipe's MagicTouch interactive segmentation
model (float32, version 1), used by Cut out to lift a subject from a photo on
the device. Nothing is uploaded; the model runs in the browser.

- Source: https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite
- Model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MagicTouch.pdf
- License: Apache License, Version 2.0 (per the model card)
- Runtime: @mediapipe/tasks-vision 1.0.1 (Apache-2.0), loaded from jsdelivr
  on first use.

Chosen on 2026-10-17 over the newer interactive_segmenter_v2 int8 model
(30 MB): on eleven test photos the two cut out the same subjects with very
similar edges, and this one was about 35 times faster on CPU (about 90 ms
against 3.2 s per photo) at a fifth of the download.
