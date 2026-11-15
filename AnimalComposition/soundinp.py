
import math

import numpy as np
import scipy.signal

from pathlib import Path
from scipy.io import wavfile
from ai_edge_litert.interpreter import Interpreter


# ==========================================
# LOAD YAMNET MODEL
# ==========================================

PROJECT_DIR = Path(__file__).resolve().parent

MODEL_PATH = PROJECT_DIR / "yamnet.tflite"

if not MODEL_PATH.exists():
    raise FileNotFoundError(
        f"YAMNet model not found: {MODEL_PATH}"
    )

interpreter = Interpreter(
    model_path=str(MODEL_PATH)
)

input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

scores_output = next(
    (
        output for output in output_details
        if output["shape"][-1] == 521
    ),
    None
)

if scores_output is None:
    raise RuntimeError(
        "Could not find YAMNet scores output."
    )


# ==========================================
# ANIMAL CLASS MAPPING
# ==========================================

SPECIFIC_ANIMALS = {

    69: "Dog",
    70: "Dog",
    71: "Dog",
    72: "Dog",
    73: "Dog",
    74: "Dog",
    75: "Dog",

    76: "Cat",
    77: "Cat",
    78: "Cat",
    79: "Cat",
    80: "Cat",

    82: "Horse",
    83: "Horse",
    84: "Horse",

    85: "Cow",
    86: "Cow",
    87: "Cow",

    88: "Pig",
    89: "Pig",

    90: "Goat",
    91: "Goat",

    92: "Sheep",

    94: "Chicken",
    95: "Chicken",
    96: "Chicken",

    97: "Turkey",
    98: "Turkey",

    99: "Duck",
    100: "Duck",

    101: "Goose",
    102: "Goose",

    104: "Lion",
    105: "Tiger",

    106: "Bird",
    107: "Bird",
    108: "Bird",
    109: "Bird",
    116: "Bird",

    110: "Pigeon",
    111: "Pigeon",

    112: "Crow",
    113: "Crow",

    114: "Owl",
    115: "Owl",

    117: "Wolf",

    118: "Rodent",
    119: "Mouse",
    120: "Rodent",

    121: "Insect",
    122: "Cricket",
    123: "Mosquito",
    124: "Fly",
    125: "Bee",
    126: "Wasp",

    127: "Frog",
    128: "Frog",

    129: "Snake",
    130: "Rattlesnake",

    131: "Whale"

}


# ==========================================
# RESAMPLE AUDIO TO 16 KHZ
# ==========================================

def ensure_sample_rate(
    original_sample_rate,
    waveform,
    desired_sample_rate=16000
):

    if original_sample_rate <= 0:
        raise ValueError("Invalid audio sample rate.")

    if original_sample_rate != desired_sample_rate:

        gcd = math.gcd(
            original_sample_rate,
            desired_sample_rate
        )

        up = desired_sample_rate // gcd
        down = original_sample_rate // gcd

        waveform = scipy.signal.resample_poly(
            waveform,
            up,
            down
        )

    return desired_sample_rate, waveform.astype(np.float32)


# ==========================================
# CONVERT AUDIO TO FLOAT32
# ==========================================

def convert_to_float32(wav_data):

    if np.issubdtype(wav_data.dtype, np.integer):

        info = np.iinfo(wav_data.dtype)

        if np.issubdtype(wav_data.dtype, np.unsignedinteger):

            midpoint = (info.max + 1) / 2

            waveform = (
                wav_data.astype(np.float32) - midpoint
            ) / midpoint

        else:

            scale = max(
                abs(info.min),
                info.max
            )

            waveform = (
                wav_data.astype(np.float32) / scale
            )

    else:

        waveform = wav_data.astype(np.float32)

    return np.nan_to_num(
        waveform,
        nan=0.0,
        posinf=0.0,
        neginf=0.0
    )


# ==========================================
# IDENTIFY ANIMAL
# ==========================================

def identify(file):

    file = Path(file)

    if not file.exists():
        raise FileNotFoundError(
            f"Audio file not found: {file}"
        )

    if file.suffix.lower() != ".wav":
        raise ValueError(
            "Only WAV recordings are supported. "
            "Please upload a WAV file."
        )

    print(f"Reading audio: {file.name}")

    try:

        sample_rate, wav_data = wavfile.read(
            str(file)
        )

    except Exception as error:

        raise RuntimeError(
            f"Could not read WAV file {file.name}: {error}"
        ) from error

    if wav_data.size == 0:
        raise ValueError("Audio recording is empty.")

    # Convert to float32.

    waveform = convert_to_float32(wav_data)

    # Convert stereo to mono.

    if waveform.ndim > 1:

        waveform = waveform.mean(axis=1)

    # Ensure a one-dimensional waveform.

    if waveform.ndim != 1:
        raise ValueError(
            "Unsupported audio channel configuration."
        )

    # Resample to 16 kHz.

    sample_rate, waveform = ensure_sample_rate(
        sample_rate,
        waveform
    )

    if waveform.size == 0:
        raise ValueError(
            "Audio contains no usable samples."
        )

    # Run YAMNet inference.

    interpreter.resize_tensor_input(
        input_details[0]["index"],
        [len(waveform)]
    )

    interpreter.allocate_tensors()

    interpreter.set_tensor(
        input_details[0]["index"],
        waveform.astype(np.float32)
    )

    interpreter.invoke()

    # Read classification scores.

    scores = interpreter.get_tensor(
        scores_output["index"]
    )

    mean_scores = scores.mean(axis=0)

    # Find highest scoring mapped animal.

    best_index = max(
        SPECIFIC_ANIMALS.keys(),
        key=lambda index: mean_scores[index]
    )

    identified_animal = SPECIFIC_ANIMALS[best_index]

    confidence = float(mean_scores[best_index])

    print(
        f"Identified {file.name}: "
        f"{identified_animal} "
        f"(score: {confidence:.4f})"
    )

    return identified_animal
