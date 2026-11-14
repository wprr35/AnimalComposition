import soundinp
from elevenlabs.client import ElevenLabs
import subprocess
from pathlib import Path
import torch
from diffusers import AutoPipelineForText2Image


#client = ElevenLabs(api_key="sk_449f4f6511de42e68ac0c26ad60d28d232c78be71d5c854d")


animals = []
folder = Path("/Users/oliverbarber/Documents/Uni Year 2/Durhack/AnimalComposition/Sounds")
#"/Users/oliverbarber/Documents/Uni Year 2/Durhack/Sounds"

for file_path in folder.iterdir():
    if file_path.is_file() and not file_path.name.startswith("."):
        animals.append(soundinp.identify(file_path))

print(animals)
#aud_txt = 'An sound of an animal which has the genes '
img_txt = 'An image of an animal which has the genes '
for animal in animals:
    #aud_txt+= f'{round(100/len(animals))}% {animal}, '
    img_txt += f'{round(100 / len(animals))}% {animal}, '
#aud_txt = aud_txt[:-2] + "."
#print(aud_txt)
print(img_txt)
#audio = client.text_to_sound_effects.convert(text=aud_txt)
animals_joined = " and ".join(a.lower() for a in animals)
animals_list = ", ".join(a.lower() for a in animals)

first_animal = animals[0].lower()
last_animal = animals[-1].lower()
all_animals = " and ".join(a.lower() for a in animals)


hyphen_animals = "-".join(a.lower() for a in animals)


# Dynamically blocks a pure/unmixed version of ANY animal in your list






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
neg_prompt = "two animals, multiple animals, pair, duo, group, crowd, split image, side by side"

image = pipe(
    prompt=image_prompt,
    negative_prompt=neg_prompt,
    num_inference_steps=4,
    guidance_scale=1.2,   # Low enough to stay fast & natural, strong enough to obey "two animals" negative prompt
    width=512,
    height=512
).images[0]


image.save("hybrid_animal.png")
print("Saved hybrid_animal.png!")

subprocess.run(["afplay", "output.mp3"])

