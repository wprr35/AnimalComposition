
import os
import json
import gc
import random

import torch

from pathlib import Path
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs
from elevenlabs import save
from transformers import pipeline
from diffusers import AutoPipelineForText2Image


# ==========================================
# CPU CONFIGURATION
# ==========================================

# Limit CPU threads to avoid excessive contention.
torch.set_num_threads(min(4, os.cpu_count() or 1))

DEVICE = "cpu"
DTYPE = torch.float32

print("Running in CPU mode.")
print("CPU threads:", torch.get_num_threads())


# ==========================================
# PROJECT PATHS
# ==========================================

PROJECT_DIR = Path(__file__).resolve().parent

SOUNDS_FOLDER = PROJECT_DIR.parent / "Sounds"
RESULTS_FOLDER = PROJECT_DIR.parent / "Results"

RESULTS_FOLDER.mkdir(parents=True, exist_ok=True)

load_dotenv(PROJECT_DIR / ".env")

api_key = os.getenv("ELEVENLABS_API_KEY")

if not api_key:
    raise RuntimeError(
        "Missing ELEVENLABS_API_KEY in .env"
    )

client = ElevenLabs(api_key=api_key)


# ==========================================
# IDENTIFY ANIMALS
# ==========================================

import soundinp

animals = []

audio_files = sorted(
    file for file in SOUNDS_FOLDER.iterdir()
    if file.is_file()
    and file.suffix.lower() == ".wav"
)

if not audio_files:
    raise RuntimeError(
        "No WAV recordings found in Sounds folder."
    )

for file_path in audio_files:

    print(f"Identifying {file_path.name}...")

    animal = soundinp.identify(file_path)

    animals.append(animal)

print("Identified animals:", animals)

if not animals:
    raise RuntimeError("No animals identified.")


# ==========================================
# CREATE ANIMAL PROMPTS
# ==========================================

aud_txt = "A sound effect of a hybrid animal combining "

for animal in animals:

    aud_txt += (
        f"{round(100 / len(animals))}% {animal}, "
    )

aud_txt = aud_txt.rstrip(", ") + "."

print("Audio prompt:", aud_txt)


# ==========================================
# GENERATE HYBRID NAME
# ==========================================

print("Loading Qwen naming model...")

namer = pipeline(
    "text-generation",
    model="Qwen/Qwen2.5-0.5B-Instruct",
    device=-1
)


def generate_hybrid_name(animal_list):

    animals_str = ", ".join(
        animal.lower() for animal in animal_list
    )

    messages = [

        {
            "role": "system",
            "content": (
                "You invent single exotic mythical creature names "
                "by blending syllables of animals together. "
                "Output ONLY the invented name."
            )
        },

        {
            "role": "user",
            "content": "Animals: lion, eagle, shark"
        },
        {
            "role": "assistant",
            "content": "Leogriffark"
        },

        {
            "role": "user",
            "content": "Animals: dog, bird, frog"
        },
        {
            "role": "assistant",
            "content": "Drird"
        },

        {
            "role": "user",
            "content": "Animals: wolf, octopus, bat"
        },
        {
            "role": "assistant",
            "content": "Woctobat"
        },

        {
            "role": "user",
            "content": "Animals: bear, snake, owl"
        },
        {
            "role": "assistant",
            "content": "Bearpentowl"
        },

        {
            "role": "user",
            "content": f"Animals: {animals_str}"
        }

    ]

    output = namer(
        messages,
        max_new_tokens=12,
        do_sample=True,
        temperature=0.85,
        top_p=0.9,
        repetition_penalty=1.4
    )

    generated = output[0]["generated_text"]

    if isinstance(generated, list):
        raw_name = generated[-1]["content"].strip()
    else:
        raw_name = str(generated).strip()

    clean_name = "".join(
        character
        for character in raw_name
        if character.isalpha() or character == "-"
    ).strip("-")

    if not clean_name:
        clean_name = "AnimalHybrid"

    return clean_name.capitalize()


name = generate_hybrid_name(animals)

print("Generated hybrid name:", name)

# Release Qwen memory before loading Stable Diffusion.

del namer
gc.collect()


# ==========================================
# GENERATE AUDIO USING ELEVENLABS
# ==========================================

print("Generating hybrid animal sound...")

audio = client.text_to_sound_effects.convert(
    text=aud_txt
)

audio_path = RESULTS_FOLDER / "output.mp3"

save(audio, str(audio_path))

print("Audio saved:", audio_path)

# ==========================================
# GENERATE INFO USING ELEVENLABS
# ==========================================

info_dat = [

  "Here, in the quiet undergrowth, we witness a truly remarkable triumph of adaptation... the {name}. By borrowing the finest traits of its ancestors, it has carved out a niche entirely its own.",

  "Nature rarely repeats itself, yet in the {name}, we see a breathtaking collage of evolutionary brilliance. Every feature serves a distinct, vital purpose in the relentless struggle for survival.",

  "At first glance, the {name} appears to be a creature of pure myth. Look closer, however, and you will see a masterclass in biological engineering, perfectly suited to its environment.",

  "Few creatures on Earth demonstrate the sheer boundless creativity of the natural world quite like the {name}. It is a living mosaic, seamlessly blending the strengths of entirely different worlds.",

  "Silent, watchful, and utterly unique... the {name} steps out from the shadows. Its hybrid nature is not an accident, but a finely tuned survival strategy millions of years in the making.",

  "To survive in an ever-changing landscape, one must be adaptable. The {name} has taken this rule to the extreme, combining disparate instincts and abilities into one extraordinary form.",

  "Even after a lifetime of observing the natural world, a glimpse of the {name} never fails to astonish. It stands as living proof that evolution is full of unexpected wonders.",

  "While other species specialize, the {name} thrives through sheer versatility. Its unusual anatomy allows it to navigate challenges that would easily defeat a lesser creature.",

  "Beneath the canopy, a rustle in the leaves announces the arrival of the {name}. Blending the agility of one lineage with the resilience of another, it is a true marvel of the wild.",

  "In the grand tapestry of life, the {name} is a most unusual thread. Against all odds, this striking fusion of species has found a way not merely to endure, but to flourish.",

  "Observe the poise of the {name}. Every movement reflects a fascinating heritage, uniting instincts from across the animal kingdom into a single, formidable presence.",

  "It is easy to think we have discovered all of nature's secrets, until we encounter the {name}. This extraordinary hybrid reminds us just how inventive life on Earth can truly be."

]

info_txt = info_dat[random.randint(0,11)].replace('{name}', name)

info = client.text_to_speech.convert(text=info_txt, voice_id='ppLqTilh7rH7fbUVlXsf')

save(info, '../Results/info.mp3')




# ==========================================
# GENERATE IMAGE USING STABLE DIFFUSION
# ==========================================

print("Loading Stable Diffusion Turbo for CPU...")

animals_joined = " and ".join(
    animal.lower() for animal in animals
)

first_animal = animals[0].lower()
last_animal = animals[-1].lower()

hyphen_animals = "-".join(
    animal.lower() for animal in animals
)

pipe = AutoPipelineForText2Image.from_pretrained(
    "stabilityai/sd-turbo",
    torch_dtype=DTYPE,
    local_files_only=True
)

pipe = pipe.to(DEVICE)

# Reduce attention memory usage.

pipe.enable_attention_slicing()

pipe.set_progress_bar_config(disable=False)

print("Stable Diffusion loaded successfully.")


# ==========================================
# IMAGE PROMPT
# ==========================================

image_prompt = (
    f"One single creature, solo portrait of a bizarre "
    f"{hyphen_animals} hybrid monster, "
    f"a single body with the head of a {first_animal} "
    f"fused onto the body of a {last_animal}, "
    f"semi-realistic 3D CGI creature design, "
    f"detailed fur and skin texture, "
    f"clean background, sharp focus"
)

neg_prompt = (
    "two animals, multiple animals, pair, duo, "
    "group, crowd, split image, side by side"
)

print("Image prompt:", image_prompt)


# ==========================================
# GENERATE IMAGE
# ==========================================

print("Generating hybrid animal image on CPU...")

with torch.inference_mode():

    image = pipe(
        prompt=image_prompt,
        negative_prompt=neg_prompt,
        num_inference_steps=4,
        guidance_scale=1.2,
        width=512,
        height=512
    ).images[0]


image_path = RESULTS_FOLDER / "hybrid_animal.png"

image.save(image_path)

print("Image saved:", image_path)

del pipe
del image

gc.collect()


# ==========================================
# SAVE GENERATED NAME
# ==========================================

name_path = RESULTS_FOLDER / "name.txt"

with open(name_path, "w", encoding="utf-8") as file:
    file.write(name)


# ==========================================
# SAVE RESULTS FOR EXPRESS
# ==========================================

results = {

    "name": name,

    "animals": animals,

    "image": "hybrid_animal.png",

    "audio": "output.mp3",

    "infoAudio": "info.mp3"

}

result_path = RESULTS_FOLDER / "result.json"

with open(
    result_path,
    "w",
    encoding="utf-8"
) as file:

    json.dump(results, file, indent=4)


# ==========================================
# COMPLETE
# ==========================================

print("--------------------------------")
print("ANIMAL GENERATION COMPLETE")
print("--------------------------------")

print("Name:", name)
print("Animals:", animals)
print("Image:", image_path)
print("Audio:", audio_path)
print("Info Audio:", RESULTS_FOLDER / "info.mp3")
print("Results:", result_path)
