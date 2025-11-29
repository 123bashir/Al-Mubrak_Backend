import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_PATH = path.join(__dirname, 'myToken.json');

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const main = async () => {
    console.log('=== Gmail API Token Setup ===');

    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

    if (!clientId || !clientSecret || clientId.includes('your_client_id')) {
        console.error('❌ Error: GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET are missing or invalid in .env file.');
        console.log('Please update your .env file with your real Google Cloud credentials.');
        process.exit(1);
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' // Force refresh token generation
    });

    console.log('\nAuthorize this app by visiting this url:\n');
    console.log(authUrl);
    console.log('\n');

    rl.question('Enter the code from that page here: ', async (code) => {
        try {
            const { tokens } = await oauth2Client.getToken(code);

            // Save tokens to myToken.json
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

            console.log('\n✅ Token stored to', TOKEN_PATH);
            console.log('You can now send emails!');
        } catch (error) {
            console.error('\n❌ Error retrieving access token:', error.message);
        } finally {
            rl.close();
        }
    });
};

main();
