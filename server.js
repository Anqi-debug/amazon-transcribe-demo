require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// AWS Configuration
AWS.config.update({ region: 'us-east-1' });  // Update to your preferred region
const s3 = new AWS.S3();
const transcribe = new AWS.TranscribeService();

const app = express();
app.use(bodyParser.raw({ type: 'audio/wav', limit: '10mb' }));
app.use(bodyParser.json()); // Use JSON parser for subsequent routes
app.use(express.static('public'));

app.post('/upload', async (req, res) => {
    const audioKey = `audio_${Date.now()}.wav`;
    const s3Params = {
        Bucket: process.env.AUDIO_BUCKET,
        Key: audioKey,
        Body: req.body,
        ContentType: 'audio/wav'
    };

    console.log('Received audio upload request');

    try {
        const uploadResult = await s3.upload(s3Params).promise();
        console.log('Audio uploaded successfully:', uploadResult.Location);
        const s3Uri = `s3://${process.env.AUDIO_BUCKET}/${audioKey}`;
        res.json({ Location: s3Uri });
    } catch (err) {
        console.error('Error uploading audio:', err);
        res.status(500).send('Error uploading audio');
    }
});

app.post('/transcribe', async (req, res) => {
    const { mediaFileUri } = req.body;

    // Add logging to debug request body
    console.log('Request body:', req.body);

    // Ensure mediaFileUri is in the correct S3 URI format
    if (!mediaFileUri.startsWith('s3://')) {
        return res.status(400).send('Invalid S3 URI');
    }

    console.log('Starting transcription job for:', mediaFileUri);

    const transcriptionJobName = `MedicalTranscriptionJob_${Date.now()}`;
    const params = {
        MedicalTranscriptionJobName: transcriptionJobName,
        LanguageCode: 'en-US',
        Media: {
            MediaFileUri: mediaFileUri
        },
        Specialty: 'PRIMARYCARE',
        Type: 'CONVERSATION',
        OutputBucketName: process.env.OUTPUT_BUCKET,
        //OutputFormat: 'json'  // Set output format to JSON
    };

    try {
        const data = await transcribe.startMedicalTranscriptionJob(params).promise();
        console.log('Transcription job started:', data);
        res.json({ TranscriptionJobName: transcriptionJobName });
    } catch (err) {
        console.error('Error starting transcription job:', err);
        res.status(500).send('Error starting transcription job');
    }
});

app.get('/transcription-status', async (req, res) => {
    const { jobName } = req.query;
    const params = {
        MedicalTranscriptionJobName: jobName
    };

    console.log('Checking status for transcription job:', jobName);

    try {
        const data = await transcribe.getMedicalTranscriptionJob(params).promise();
        //console.log('Full transcription job response:', JSON.stringify(data, null, 2));
        res.json(data.MedicalTranscriptionJob);
    } catch (err) {
        console.error('Error checking transcription job status:', err);
        res.status(500).send('Error checking transcription job status');
    }
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
