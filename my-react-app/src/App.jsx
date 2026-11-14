
import { useState, useRef, useEffect } from "react";
import "./App.css";

// ==========================================
// CONVERT AUDIO BUFFER TO WAV
// ==========================================

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;

  const dataLength =
    buffer.length * numChannels * bytesPerSample;

  const wavBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wavBuffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // WAV header
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);

  view.setUint32(
    28,
    sampleRate * numChannels * bytesPerSample,
    true
  );

  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);

  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  // Convert samples to 16-bit PCM
  const channels = [];

  for (let channel = 0; channel < numChannels; channel++) {
    channels.push(buffer.getChannelData(channel));
  }

  let offset = 44;

  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(
        -1,
        Math.min(1, channels[channel][i])
      );

      const pcm =
        sample < 0
          ? sample * 0x8000
          : sample * 0x7FFF;

      view.setInt16(offset, pcm, true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], {
    type: "audio/wav",
  });
}

// ==========================================
// MAIN APPLICATION
// ==========================================

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  const [progress, setProgress] = useState(0);
  const [playProgress, setPlayProgress] = useState(0);
  const [level, setLevel] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const audioRef = useRef(null);
  const analyserRef = useRef(null);

  const rafRef = useRef(null);
  const timerRef = useRef(null);
  const intervalRef = useRef(null);

  const audioCtxRef = useRef(null);
  const discardRef = useRef(false);
  const audioUrlRef = useRef(null);

  // ==========================================
  // CLEAN UP AUDIO URL
  // ==========================================

  const clearAudioUrl = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    setAudioUrl(null);
    setAudioFile(null);
  };

  // ==========================================
  // START RECORDING
  // ==========================================

  const start_record = async () => {
    if (isRecording) return;

    let stream;
    let ctx;

    try {
      discardRef.current = false;

      // Request microphone permission
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // Create audio context
      ctx = new AudioContext();
      await ctx.resume();

      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();

      analyser.fftSize = 256;
      source.connect(analyser);

      analyserRef.current = analyser;

      // Select a supported recording format
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const supportedType = mimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );

      const recorder = supportedType
        ? new MediaRecorder(stream, {
            mimeType: supportedType,
          })
        : new MediaRecorder(stream);

      console.log("Recording format:", recorder.mimeType);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      // Clear previous recording
      clearAudioUrl();

      setProgress(0);
      setPlayProgress(0);
      setLevel(0);
      setIsPlaying(false);
      setIsRecording(true);

      // ==========================================
      // COLLECT AUDIO DATA
      // ==========================================

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // ==========================================
      // STOP RECORDING AND CONVERT TO WAV
      // ==========================================

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        try {
          await ctx.close();
        } catch (error) {
          console.warn("Audio context close:", error);
        }

        if (audioCtxRef.current === ctx) {
          audioCtxRef.current = null;
        }

        if (discardRef.current) return;

        try {
          // Combine recorded chunks
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });

          if (blob.size === 0) {
            throw new Error("The recording is empty.");
          }

          console.log("Original audio format:", blob.type);
          console.log("Original audio size:", blob.size);

          // Decode recorded audio
          const decodeCtx = new AudioContext();

          let audioBuffer;

          try {
            const arrayBuffer = await blob.arrayBuffer();

            audioBuffer = await decodeCtx.decodeAudioData(
              arrayBuffer
            );
          } finally {
            await decodeCtx.close();
          }

          if (discardRef.current) return;

          // Convert audio to WAV
          const wavBlob = audioBufferToWav(audioBuffer);

          const wavFile = new File(
            [wavBlob],
            "animal-recording.wav",
            {
              type: "audio/wav",
            }
          );

          // Create playback URL
          const url = URL.createObjectURL(wavFile);

          if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
          }

          audioUrlRef.current = url;

          setAudioFile(wavFile);
          setAudioUrl(url);

          console.log("WAV conversion successful!");
          console.log("WAV size:", wavFile.size);

        } catch (error) {
          console.error("WAV conversion error:", error);

          alert(
            "Could not convert recording to WAV.\n\n" +
            error.name +
            ": " +
            error.message
          );
        }
      };

      // Start recorder
      recorder.start();

      // ==========================================
      // RECORDING PROGRESS
      // ==========================================

      const startTime = Date.now();

      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;

        const percentage = Math.min(
          (elapsed / 5000) * 100,
          100
        );

        setProgress(percentage);
      }, 50);

      // ==========================================
      // AUTOMATICALLY STOP AFTER 5 SECONDS
      // ==========================================

      timerRef.current = setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
        }

        clearInterval(intervalRef.current);

        setProgress(100);
        setIsRecording(false);
        setLevel(0);

        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      }, 5000);

      // ==========================================
      // SOUND VISUALISER
      // ==========================================

      const data = new Uint8Array(analyser.fftSize);

      const draw = () => {
        if (
          analyserRef.current === analyser &&
          recorder.state === "recording"
        ) {
          analyser.getByteTimeDomainData(data);

          let sum = 0;

          for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128;
            sum += normalized * normalized;
          }

          const rms = Math.sqrt(sum / data.length);
          const volume = Math.min(rms * 10, 1);

          setLevel(volume);

          rafRef.current = requestAnimationFrame(draw);
        }
      };

      draw();

    } catch (error) {
      console.error("Microphone error:", error);

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (ctx && ctx.state !== "closed") {
        await ctx.close();
      }

      if (audioCtxRef.current === ctx) {
        audioCtxRef.current = null;
      }

      analyserRef.current = null;

      setIsRecording(false);

      alert(
        "Could not access microphone.\n\n" +
        error.name +
        ": " +
        error.message
      );
    }
  };

  // ==========================================
  // PLAY / PAUSE RECORDING
  // ==========================================

  const toggle_play = async () => {
    const audio = audioRef.current;

    if (!audio || !audioUrl) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        if (
          audio.ended ||
          audio.currentTime >= audio.duration
        ) {
          audio.currentTime = 0;
        }

        await audio.play();

        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Audio playback error:", error);

      setIsPlaying(false);

      alert("Could not play recording: " + error.message);
    }
  };

  // ==========================================
  // RESET RECORDING
  // ==========================================

  const toggle_stop = () => {
    discardRef.current = true;

    clearTimeout(timerRef.current);
    clearInterval(intervalRef.current);

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (
      mediaRecorderRef.current?.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }

    analyserRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    if (
      audioCtxRef.current &&
      audioCtxRef.current.state !== "closed"
    ) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
    }

    clearAudioUrl();

    setIsRecording(false);
    setIsPlaying(false);
    setIsSubmitting(false);

    setProgress(0);
    setPlayProgress(0);
    setLevel(0);

    chunksRef.current = [];
  };

  // ==========================================
  // SUBMIT WAV TO SERVER
  // ==========================================

  const submit = async () => {
    if (!audioFile || isSubmitting) {
      return;
    }

    try {
      setIsSubmitting(true);

      const formData = new FormData();

      formData.append("audio", audioFile);

      const response = await fetch(
        "http://localhost:5000/api/save-audio",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save recording.");
      }

      const result = await response.json();

      console.log("Submitted:", result);

      alert(
        "Recording saved successfully!\n\n" +
        result.filename
      );

    } catch (error) {
      console.error("Save error:", error);

      alert(
        "Could not save your recording.\n\n" +
        error.message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // NEXT BUTTON
  // ==========================================

  const next = () => {
    toggle_stop();
    console.log("Next!");
  };

  // ==========================================
  // CLEAN UP WHEN COMPONENT UNMOUNTS
  // ==========================================

  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      clearInterval(intervalRef.current);

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      if (
        mediaRecorderRef.current?.state === "recording"
      ) {
        mediaRecorderRef.current.stop();
      }

      if (
        audioCtxRef.current &&
        audioCtxRef.current.state !== "closed"
      ) {
        audioCtxRef.current.close();
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }

      if (mediaRecorderRef.current?.stream) {
        mediaRecorderRef.current.stream
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, []);

  // ==========================================
  // USER INTERFACE
  // ==========================================

  return (
    <>
      <section id="title_section">
        <h1 id="title">Animal Composer</h1>

        <p>Make an animal sound!</p>

        <p>Record your sound for up to 5 seconds.</p>
      </section>

      <section id="middle_section">
        <div id="recording_container">

          {/* RECORD BUTTON */}

          {!isRecording && !audioFile && (
            <button
              id="record_button"
              onClick={start_record}
            >
              🎙️
            </button>
          )}

          {/* RECORDING INTERFACE */}

          {isRecording && (
            <div id="player_bar">

              <div id="soundbar">
                <div
                  id="soundbar_fill"
                  style={{
                    width: `${level * 100}%`,
                    height: "100%",
                  }}
                />
              </div>

              <div className="progress_container">
                <div
                  className="progress_fill"
                  style={{
                    width: `${progress}%`,
                  }}
                />
              </div>

              <p>
                {Math.max(
                  0,
                  Math.ceil((5000 - progress * 50) / 1000)
                )} seconds left
              </p>

            </div>
          )}

          {/* PLAYBACK INTERFACE */}

          {!isRecording && audioFile && audioUrl && (
            <div id="player_bar">

              <audio
                ref={audioRef}
                src={audioUrl}
                preload="auto"

                onTimeUpdate={() => {
                  const audio = audioRef.current;

                  if (audio && audio.duration) {
                    setPlayProgress(
                      (audio.currentTime / audio.duration) * 100
                    );
                  }
                }}

                onEnded={() => {
                  setIsPlaying(false);
                  setPlayProgress(100);
                }}

                onPause={() => {
                  setIsPlaying(false);
                }}
              />

              {/* PLAYBACK PROGRESS */}

              <div className="progress_container">
                <div
                  className="progress_fill"
                  style={{
                    width: `${playProgress}%`,
                  }}
                />
              </div>

              {/* PLAY / PAUSE */}

              <button
                id="play-pause_button"
                onClick={toggle_play}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>

              {/* RESET */}

              <button
                id="reset_button"
                onClick={toggle_stop}
              >
                ↺
              </button>

              {/* SUBMIT */}

              <button
                id="submit_button"
                onClick={submit}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Submit"}
              </button>

            </div>
          )}

        </div>
      </section>

      {/* NEXT BUTTON */}

      <section id="lower_section">
        <button
          id="next_button"
          onClick={next}
        >
          →
        </button>
      </section>
    </>
  );
}

export default App;
