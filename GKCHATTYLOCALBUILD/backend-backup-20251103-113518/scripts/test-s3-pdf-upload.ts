import 'dotenv/config';
import { getPresignedUrlForPut } from '../utils/s3Helper';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

async function testPdfUpload() {
  console.log('=== S3 PDF Upload Test Script ===\n');

  // Configuration
  const testFileName = 'test-document.pdf';
  const contentType = 'application/pdf';
  const userId = 'test-user-123';
  const fileId = Date.now().toString();
  const s3Key = `user_docs/${userId}/${fileId}.pdf`;

  console.log('Test Configuration:');
  console.log(`- File Name: ${testFileName}`);
  console.log(`- Content Type: ${contentType}`);
  console.log(`- S3 Key: ${s3Key}`);
  console.log(`- Bucket: ${process.env.AWS_BUCKET_NAME || 'Not set'}`);
  console.log(`- Region: ${process.env.AWS_REGION || 'Not set'}\n`);

  try {
    // Step 1: Generate pre-signed URL
    console.log('Step 1: Generating pre-signed URL...');
    const presignedUrl = await getPresignedUrlForPut(s3Key, contentType, 300);

    console.log('\nGenerated Pre-signed URL:');
    console.log('='.repeat(80));
    console.log(presignedUrl);
    console.log('='.repeat(80));

    // Parse URL for analysis
    const urlObj = new URL(presignedUrl);
    console.log('\nURL Analysis:');
    console.log(`- Host: ${urlObj.hostname}`);
    console.log(`- Path: ${urlObj.pathname}`);
    console.log('- Query Parameters:');
    urlObj.searchParams.forEach((value, key) => {
      const displayValue =
        key.includes('Signature') || key.includes('Credential')
          ? value.substring(0, 20) + '...'
          : value;
      console.log(`  - ${key}: ${displayValue}`);
    });

    // Step 2: Create a test PDF file if it doesn't exist
    const testFilePath = path.join(__dirname, testFileName);
    if (!fs.existsSync(testFilePath)) {
      console.log(`\nStep 2: Creating test PDF file at ${testFilePath}...`);
      // Create a simple PDF using echo and base64 (minimal valid PDF)
      const minimalPdf = Buffer.from(
        'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKL01lZGlhQm94IFswIDAgNjEyIDc5Ml0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovUmVzb3VyY2VzIDw8Cj4+Cj4+CmVuZG9iagp4cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA2OCAwMDAwMCBuIAowMDAwMDAwMTU3IDAwMDAwIG4gCnRyYWlsZXIKPDwKL1NpemUgNAovUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKMjMxCiUlRU9G',
        'base64'
      );
      fs.writeFileSync(testFilePath, minimalPdf);
      console.log(`Created minimal test PDF (${minimalPdf.length} bytes)`);
    } else {
      const stats = fs.statSync(testFilePath);
      console.log(`\nStep 2: Using existing test PDF (${stats.size} bytes)`);
    }

    // Step 3: Generate curl command
    console.log('\nStep 3: Generating curl command...');
    const curlCommand = `curl -v -X PUT -T "${testFilePath}" \\
     -H "Content-Type: ${contentType}" \\
     "${presignedUrl}"`;

    console.log('\nCurl command to test upload:');
    console.log('='.repeat(80));
    console.log(curlCommand);
    console.log('='.repeat(80));

    // Step 4: Execute curl command
    console.log('\nStep 4: Executing curl command...\n');

    try {
      const output = execSync(curlCommand, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      console.log('CURL STDOUT:', output);
      console.log('\n✅ Upload appears to have succeeded!');
    } catch (error: any) {
      console.error('CURL STDERR:', error.stderr || error.message);
      console.error('\n❌ Upload failed!');

      // Try to extract specific error information
      if (error.stderr) {
        const lines = error.stderr.split('\n');
        const httpStatusLine = lines.find(line => line.includes('< HTTP/'));
        if (httpStatusLine) {
          console.error(`HTTP Status: ${httpStatusLine}`);
        }

        // Look for XML error response from S3
        const xmlStart = error.stderr.indexOf('<?xml');
        if (xmlStart !== -1) {
          console.error('\nS3 Error Response:');
          console.error(error.stderr.substring(xmlStart));
        }
      }
    }
  } catch (error) {
    console.error('Script error:', error);
    process.exit(1);
  }
}

// Run the test
testPdfUpload().catch(console.error);
