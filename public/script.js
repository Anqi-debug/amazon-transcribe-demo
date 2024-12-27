let mediaRecorder;
let audioChunks = [];

document.getElementById('start').onclick = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        // Initialize audioChunks when starting a new recording
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
            console.log('Data available:', event.data);
        };

        mediaRecorder.start();
        console.log('Recording started');
    } catch (error) {
        console.error('Error starting recording:', error);
    }
};

document.getElementById('stop').onclick = () => {
    try {
        mediaRecorder.stop();
        console.log('Recording stopped');

        mediaRecorder.onstop = async () => {
            try {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(audioBlob);
                document.getElementById('audioPlayback').src = audioUrl;

                console.log('Audio Blob:', audioBlob);
                console.log('Audio URL:', audioUrl);

                // Upload audioBlob to S3 and start Transcribe job
                await uploadAudioToS3(audioBlob);
            } catch (error) {
                console.error('Error processing recording:', error);
            }
        };
    } catch (error) {
        console.error('Error stopping recording:', error);
    }
};

async function uploadAudioToS3(audioBlob) {
    try {
        console.log('Uploading audio to S3...');

        const response = await fetch('/upload', {
            method: 'POST',
            body: audioBlob
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        console.log('Upload response:', data);

        // Start transcription job using the uploaded audio
        await startTranscriptionJob(data.Location);
    } catch (error) {
        console.error('Error uploading audio:', error);
    }
}

async function startTranscriptionJob(mediaFileUri) {
    try {
        console.log('Starting transcription job for:', mediaFileUri);

        const response = await fetch('/transcribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mediaFileUri })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        console.log('Transcription job response:', data);

        // Poll transcription job status and retrieve result
        await pollTranscriptionJobStatus(data.TranscriptionJobName);
    } catch (error) {
        console.error('Error starting transcription job:', error);
    }
}

async function pollTranscriptionJobStatus(jobName) {
    try {
        console.log('Polling transcription job status for:', jobName);

        const response = await fetch(`/transcription-status?jobName=${jobName}`);
        
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        //console.log('Full transcription job status response:', data);

        if (data.TranscriptionJobStatus === 'COMPLETED') {
            //console.log('Transcription completed:', data.TranscriptFileUri);
            const transcriptFileUri = data.Transcript.TranscriptFileUri;
            console.log('Transcription completed:', transcriptFileUri);
            // Download and display the transcription result
            await downloadTranscriptionResult(transcriptFileUri);
        } else if (data.TranscriptionJobStatus === 'FAILED') {
            console.error('Transcription job failed:', data.FailureReason);
        } else {
            // Job is still in progress, wait and poll again
            setTimeout(() => pollTranscriptionJobStatus(jobName), 5000);
        }
    } catch (error) {
        console.error('Error polling transcription job status:', error);
    }
}

async function downloadTranscriptionResult(transcriptUri) {
    try {
        console.log('Downloading transcription result from:', transcriptUri);

        const response = await fetch(transcriptUri);

        if (!response.ok) {
            throw new Error(`Network response was not ok. Status: ${response.status}`);
        }

        const result = await response.json();
        const transcript = result.results.transcripts[0].transcript;
        document.getElementById('transcriptionResult').textContent = transcript;
        // Log the successful completion of the process
        console.log('Transcription download and display completed.');
    } catch (error) {
        console.error('Error downloading transcription result:', error);
        document.getElementById('transcriptionResult').textContent = 'Error downloading transcription result';
    }
}
