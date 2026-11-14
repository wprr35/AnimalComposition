import math
import numpy as np
import scipy.signal
from scipy.io import wavfile
from ai_edge_litert.interpreter import Interpreter

interpreter = Interpreter(model_path='yamnet.tflite')
input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

# Automatically find the output tensor with 521 class scores (not embeddings or spectrogram)
scores_output = next(o for o in output_details if o['shape'][-1] == 521)

SPECIFIC_ANIMALS = {
    69: "Dog", 70: "Dog", 71: "Dog", 72: "Dog", 73: "Dog", 74: "Dog", 75: "Dog",
    76: "Cat", 77: "Cat", 78: "Cat", 79: "Cat", 80: "Cat",
    82: "Horse", 83: "Horse", 84: "Horse",
    85: "Cow", 86: "Cow", 87: "Cow",
    88: "Pig", 89: "Pig",
    90: "Goat", 91: "Goat",
    92: "Sheep",
    94: "Chicken", 95: "Chicken", 96: "Chicken",
    97: "Turkey", 98: "Turkey",
    99: "Duck", 100: "Duck",
    101: "Goose", 102: "Goose",
    104: "Lion", 105: "Tiger",
    106: "Bird", 107: "Bird", 108: "Bird", 109: "Bird", 116: "Bird",
    110: "Pigeon", 111: "Pigeon",
    112: "Crow", 113: "Crow",
    114: "Owl", 115: "Owl",
    117: "Wolf",
    118: "Rodent", 119: "Mouse", 120: "Rodent",
    121: "Insect",
    122: "Cricket",
    123: "Mosquito",
    124: "Fly", 125: "Bee",
    126: "Wasp",
    127: "Frog", 128: "Frog",
    129: "Snake", 130: "Rattlesnake",
    131: "Whale"
}

def ensure_sample_rate(original_sample_rate, waveform, desired_sample_rate=16000):
    if original_sample_rate != desired_sample_rate:
        gcd = math.gcd(original_sample_rate, desired_sample_rate)
        up = desired_sample_rate // gcd
        down = original_sample_rate // gcd
        waveform = scipy.signal.resample_poly(waveform, up, down)
    return desired_sample_rate, waveform.astype(np.float32)

def identify(file):
    # Load and normalise any WAV format (16-bit, 24-bit, 32-bit int or float)
    import subprocess
    import tempfile

    # Inside identify(file), right before line 53:
    with open(file, "rb") as f:
        header = f.read(4)

    # If the file doesn't start with RIFF/RIFX/RF64, convert it via macOS afconvert
    if header not in (b"RIFF", b"RIFX", b"RF64"):
        tmp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16", str(file), tmp_wav], check=True)
        file = tmp_wav

    sample_rate, wav_data = wavfile.read(file)
    sample_rate, wav_data = wavfile.read(file)
    if np.issubdtype(wav_data.dtype, np.integer):
        waveform = wav_data.astype(np.float32) / np.iinfo(wav_data.dtype).max
    else:
        waveform = wav_data.astype(np.float32)

    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)

    sample_rate, waveform = ensure_sample_rate(sample_rate, waveform)

    # Run inference
    interpreter.resize_tensor_input(input_details[0]['index'], [len(waveform)])
    interpreter.allocate_tensors()
    interpreter.set_tensor(input_details[0]['index'], waveform)
    interpreter.invoke()

    # Read the 521-class scores tensor
    scores = interpreter.get_tensor(scores_output['index'])
    mean_scores = scores.mean(axis=0)

    best_index = max(SPECIFIC_ANIMALS.keys(), key=lambda idx: mean_scores[idx])
    return SPECIFIC_ANIMALS[best_index]
