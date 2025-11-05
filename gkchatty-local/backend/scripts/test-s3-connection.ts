#!/usr/bin/env ts-node
/**
 * Test S3 Connection and Credentials
 * Verifies AWS credentials and bucket access
 */

import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import colors from 'colors';

dotenv.config();

const success = (text: string) => colors.green(text);
const error = (text: string) => colors.red(text);
const info = (text: string) => colors.cyan(text);
const header = (text: string) => colors.bold.white(text);

async function testS3Connection() {
  console.log(header('\n╔════════════════════════════════════════════════════════════════╗'));
  console.log(header('║                    S3 CONNECTION TEST                          ║'));
  console.log(header('╚════════════════════════════════════════════════════════════════╝\n'));

  // Check environment variables
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucketName = process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET;

  console.log(info('Configuration:'));
  console.log(`  AWS_REGION: ${region || error('MISSING')}`);
  console.log(`  AWS_ACCESS_KEY_ID: ${accessKeyId ? success('SET') : error('MISSING')}`);
  console.log(`  AWS_SECRET_ACCESS_KEY: ${secretAccessKey ? success('SET') : error('MISSING')}`);
  console.log(`  S3_BUCKET_NAME: ${bucketName || error('MISSING')}\n`);

  if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
    console.log(error('❌ Missing required S3 configuration. Check your .env file.\n'));
    process.exit(1);
  }

  // Initialize S3 client
  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const tests = [];

  // Test 1: List objects (verifies credentials and bucket access)
  console.log(header('Test 1: List Bucket Objects'));
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      MaxKeys: 10,
    });

    const response = await s3Client.send(command);
    console.log(success('✅ PASS: Successfully listed bucket contents'));
    console.log(info(`   Found ${response.KeyCount || 0} objects (showing max 10)`));

    if (response.Contents && response.Contents.length > 0) {
      console.log(info('   Sample objects:'));
      response.Contents.slice(0, 5).forEach((obj) => {
        console.log(info(`     - ${obj.Key} (${(obj.Size || 0 / 1024).toFixed(2)} KB)`));
      });
    }

    tests.push({ name: 'List Objects', passed: true });
  } catch (err: any) {
    console.log(error('❌ FAIL: Could not list bucket contents'));
    console.log(error(`   Error: ${err.message}`));

    if (err.name === 'NoSuchBucket') {
      console.log(error(`   Bucket "${bucketName}" does not exist`));
    } else if (err.name === 'InvalidAccessKeyId') {
      console.log(error('   Invalid AWS Access Key ID'));
    } else if (err.name === 'SignatureDoesNotMatch') {
      console.log(error('   Invalid AWS Secret Access Key'));
    } else if (err.name === 'AccessDenied') {
      console.log(error('   Access denied - check IAM permissions'));
    }

    tests.push({ name: 'List Objects', passed: false, error: err.message });
  }

  console.log('');

  // Test 2: Write a test file
  console.log(header('Test 2: Write Test File'));
  const testKey = 'test-connection/test-file.txt';
  const testContent = `S3 Connection Test - ${new Date().toISOString()}`;

  try {
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
    });

    await s3Client.send(putCommand);
    console.log(success('✅ PASS: Successfully uploaded test file'));
    console.log(info(`   Key: ${testKey}`));

    tests.push({ name: 'Write File', passed: true });
  } catch (err: any) {
    console.log(error('❌ FAIL: Could not upload test file'));
    console.log(error(`   Error: ${err.message}`));

    tests.push({ name: 'Write File', passed: false, error: err.message });
  }

  console.log('');

  // Test 3: Delete test file (cleanup)
  console.log(header('Test 3: Delete Test File'));
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: testKey,
    });

    await s3Client.send(deleteCommand);
    console.log(success('✅ PASS: Successfully deleted test file'));
    console.log(info('   Cleanup complete'));

    tests.push({ name: 'Delete File', passed: true });
  } catch (err: any) {
    console.log(error('❌ FAIL: Could not delete test file'));
    console.log(error(`   Error: ${err.message}`));
    console.log(info(`   Note: Test file "${testKey}" may still exist in bucket`));

    tests.push({ name: 'Delete File', passed: false, error: err.message });
  }

  console.log('');

  // Summary
  console.log(header('╔════════════════════════════════════════════════════════════════╗'));
  console.log(header('║                        TEST SUMMARY                            ║'));
  console.log(header('╚════════════════════════════════════════════════════════════════╝\n'));

  const passedTests = tests.filter((t) => t.passed).length;
  const totalTests = tests.length;

  tests.forEach((test) => {
    const icon = test.passed ? success('✅') : error('❌');
    console.log(`${icon} ${test.name}`);
    if (!test.passed && test.error) {
      console.log(error(`   Error: ${test.error}`));
    }
  });

  console.log('');
  console.log(header('═══════════════════════════════════════════════════════════════'));

  if (passedTests === totalTests) {
    console.log(success(`\n🎉 ALL TESTS PASSED (${passedTests}/${totalTests})`));
    console.log(success('\nS3 connection is working correctly!'));
    console.log(info('\nYour production file storage is ready.'));
    console.log(info(`Files will be stored in: s3://${bucketName}/\n`));
    process.exit(0);
  } else {
    console.log(error(`\n❌ TESTS FAILED (${passedTests}/${totalTests} passed)`));
    console.log(error('\nS3 connection has issues. Please check:'));
    console.log(error('  1. AWS credentials are correct'));
    console.log(error('  2. S3 bucket exists and is in the correct region'));
    console.log(error('  3. IAM permissions allow s3:ListBucket, s3:PutObject, s3:DeleteObject\n'));
    process.exit(1);
  }
}

testS3Connection().catch((err) => {
  console.error(error(`\n❌ Fatal error: ${err.message}\n`));
  process.exit(1);
});
