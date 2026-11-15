import soundinp
from elevenlabs.client import ElevenLabs
from elevenlabs import save
import subprocess
from transformers import pipeline
from pathlib import Path
import torch
from diffusers import AutoPipelineForText2Image


client = ElevenLabs(api_key="sk_8c8d2a0ad136a2bbed1822d76bab335d18c17a25c6c1097e")


animals = []
folder = Path("../Sounds")
#"/Users/oliverbarber/Documents/Uni Year 2/Durhack/Sounds"

for file_path in folder.iterdir():
    if file_path.is_file() and not file_path.name.startswith("."):
        animals.append(soundinp.identify(file_path))

print(animals)
aud_txt = 'An sound of an animal which has the genes '
img_txt = 'An image of an animal which has the genes '
for animal in animals:
    aud_txt+= f'{round(100/len(animals))}% {animal}, '
    img_txt += f'{round(100 / len(animals))}% {animal}, '
aud_txt = aud_txt[:-2] + "."
print(aud_txt)
print(img_txt)
audio = client.text_to_sound_effects.convert(text=aud_txt)
namer = pipeline(
    "text-generation",
    model="Qwen/Qwen2.5-0.5B-Instruct",
    device="cpu"
)


def generate_hybrid_name(animal_list):
    animals_str = ", ".join(a.lower() for a in animal_list)

    # Few-shot examples teach the small model to invent a single blended word
    messages = [
        {
            "role": "system",
            "content": "You invent single exotic mythical creature names by blending syllables of animals together. Output ONLY the invented name."
        },
        {"role": "user", "content": "Animals: lion, eagle, shark"},
        {"role": "assistant", "content": "Leogriffark"},
        {"role": "user", "content": "Animals: dog, bird, frog"},
        {"role": "assistant", "content": "Drird"},
        {"role": "user", "content": "Animals: wolf, octopus, bat"},
        {"role": "assistant", "content": "Woctobat"},
        {"role": "user", "content": "Animals: bear, snake, owl"},
        {"role": "assistant", "content": "Bearpentowl"},
        {"role": "user", "content": f"Animals: {animals_str}"}
        ]
    output = namer(
        messages,
        max_new_tokens=12,
        do_sample=True,
        temperature=0.85,
        top_p=0.9,
        repetition_penalty=1.4  # Stops it from just repeating "dog"
    )
    raw_name = output[0]["generated_text"][-1]["content"].strip()

    # Keep only letters/hyphens so it works safely as a filename
    clean_name = "".join(c for c in raw_name if c.isalpha() or c == "-").strip()
    return clean_name.capitalize()
name = generate_hybrid_name(animals)

print(name)

save(audio, '../Results/output.mp3')
animals_joined = " and ".join(a.lower() for a in animals)
animals_list = ", ".join(a.lower() for a in animals)

first_animal = animals[0].lower()
last_animal = animals[-1].lower()
all_animals = " and ".join(a.lower() for a in animals)


hyphen_animals = "-".join(a.lower() for a in animals)

# Downloads once (~6 GB), then runs completely offline in a few seconds per image
pipe = AutoPipelineForText2Image.from_pretrained(
    "stabilityai/sd-turbo",
    local_files_only=True
).to("cpu")

image_prompt = (
    f"One single creature, solo portrait of a bizarre {hyphen_animals} hybrid monster, "
    f"a single body with the head of a {first_animal} fused onto the body of a {last_animal}, "
    f"semi-realistic 3D CGI creature design, detailed fur and skin texture, clean background, sharp focus"
)
print(image_prompt)
neg_prompt = "two animals, multiple animals, pair, duo, group, crowd, split image, side by side"

image = pipe(
    prompt=image_prompt,
    negative_prompt=neg_prompt,
    num_inference_steps=4,
    guidance_scale=1.2,   # Low enough to stay fast & natural, strong enough to obey "two animals" negative prompt
    width=512,
    height=512
).images[0]


image.save("../Results/hybrid_animal.png")
file = open('../Results/name.txt', 'w')
file.write(name)
file.close()

subprocess.run(["afplay", "output.mp3"])

