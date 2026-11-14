
import { useState, useRef, useEffect } from "react";
import './App.css';

// Convert AudioBuffer into WAV format
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

  view.setUint16(
    32,
    numChannels * bytesPerSample,
    true
  );

  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  // Convert audio samples into 16-bit PCM
  const channels = [];

  for (let channel = 0; channel < numChannels; channel++) {
    channels.push(buffer.getChannelData(channel));
  }

  let offset = 44;

  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = Math.max(
        -1,
        Math.min(1, channels[channel][i])
      );

      const pcm = sample < 0
        ? sample * 0x8000
        : sample * 0x7FFF;

      view.setInt16(offset, pcm, true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], {
    type: "audio/wav"
  });
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [playProgress, setPlayProgress] = useState(0);
  const [level, setLevel] = useState(0);

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

  // Start recording
  const start_record = async () => {
    try {
      if (isRecording) return;

      discardRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      const ctx = new AudioContext();
      await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();

      analyser.fftSize = 256;
      source.connect(analyser);

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      setProgress(0);
      setPlayProgress(0);
      setLevel(0);
      setIsRecording(true);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // Convert recording into WAV when stopped
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        await ctx.close();

        if (discardRef.current) return;

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm"
        });

        try {
          const arrayBuffer = await blob.arrayBuffer();

          const decodeCtx = new AudioContext();

          const audioBuffer = await decodeCtx.decodeAudioData(
            arrayBuffer
          );

          const wavBlob = audioBufferToWav(audioBuffer);

          await decodeCtx.close();

          if (discardRef.current) return;

          const wavFile = new File(
          [wavBlob],
          "animal-recording.wav",
          {
            type: "audio/wav"
          }
        );

        setAudioFile(wavFile);

        } catch (err) {
          console.error("WAV conversion error:", err);
          alert("Could not convert recording to WAV.");
        }
      };

      recorder.start();

      // Recording progress bar
      const startTime = Date.now();

      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;

        const percentage = Math.min(
          (elapsed / 5000) * 100,
          100
        );

        setProgress(percentage);
      }, 50);

      // Stop recording after 5 seconds
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
        }
      }, 5000);

      // Sound visualiser using RMS
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

    } catch (err) {
      console.error("Microphone error:", err);
      setIsRecording(false);
      alert("Please allow microphone access.");
    }
  };

  // Play / pause recording
  const toggle_play = () => {
    if (!audioRef.current) return;

    const audio = audioRef.current;

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

      setPlayProgress(
        audio.duration
          ? (audio.currentTime / audio.duration) * 100
          : 0
      );

      audio.play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    }
  };

  // Reset recording
  const toggle_stop = () => {
    discardRef.current = true;

    clearTimeout(timerRef.current);
    clearInterval(intervalRef.current);

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    analyserRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    setAudioUrl(null);
    setIsRecording(false);
    setIsPlaying(false);
    setProgress(0);
    setPlayProgress(0);
    setLevel(0);
  };

  // Submit recording
  const submit = () => {
    if (!audioFile) return;

    console.log("Submitted!", audioFile);
    alert("Recording submitted!");
  };

  // Next button
  const next = () => {
    toggle_stop();
    console.log("Next!");
  };

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      clearInterval(intervalRef.current);

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }

      audioCtxRef.current?.close();

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  return (
    <>
      <section id="title_section">
        <h1 id="title">Animal Composer</h1>
        <p>Make an animal sound!</p>
        <p>Record your sound for up to 5 seconds.</p>
      </section>

      <section id="middle_section">
        <div id="recording_container">

          {!isRecording && !audioFile && (
            <button
              id="record_button"
              onClick={start_record}
            >
              🎙️
            </button>
          )}

          {isRecording && (
            <div id="player_bar">

              <div id="soundbar">
                <div
                  id="soundbar_fill"
                  style={{
                    width: `${level * 100}%`,
                    height: "100%"
                  }}
                />
              </div>

              <div className="progress_container">
                <div
                  className="progress_fill"
                  style={{
                    width: `${progress}%`
                  }}
                />
              </div>

              <p>
                {Math.max(
                  0,
                  Math.ceil((5000 - progress * 50) / 1000)
                )} seconds left
              </p>

              <button
                id="reset_button"
                onClick={toggle_stop}
              >
                ↺
              </button>

            </div>
          )}

          {!isRecording && audioFile && (
            <div id="player_bar">

              <audio
                ref={audioRef}
                src={audioFile}
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
              />

              <div className="progress_container">
                <div
                  className="progress_fill"
                  style={{
                    width: `${playProgress}%`
                  }}
                />
              </div>

              <button
                id="play-pause_button"
                onClick={toggle_play}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>

              <button
                id="reset_button"
                onClick={toggle_stop}
              >
                ↺
              </button>

              <button
                id="submit_button"
                onClick={submit}
              >
                Submit
              </button>

            </div>
          )}

        </div>
      </section>

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
