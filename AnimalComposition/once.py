import os
import ssl
import certifi

os.environ['SSL_CERT_FILE'] = certifi.where()
ssl._create_default_https_context = lambda: ssl.create_default_context(cafile=certifi.where())

import tensorflow as tf
import tensorflow_hub as hub

model = hub.load('https://tfhub.dev' + '/google/yamnet/1')
concrete_func = model.signatures[tf.saved_model.DEFAULT_SERVING_SIGNATURE_DEF_KEY]
concrete_func.inputs[0].set_shape([None])

converter = tf.lite.TFLiteConverter.from_concrete_functions([concrete_func], model)
tflite_model = converter.convert()

with open('yamnet.tflite', 'wb') as f:
    f.write(tflite_model)

print("Successfully saved yamnet.tflite!")
