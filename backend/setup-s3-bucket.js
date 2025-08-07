const { S3Client, PutBucketPolicyCommand, PutPublicAccessBlockCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

async function setupBucketForPublicRead() {
    try {
        console.log(`🔧 Setting up bucket: ${BUCKET_NAME}`);
        
        // 1. First, allow public access to bucket
        console.log('📝 Configuring public access block settings...');
        await s3Client.send(new PutPublicAccessBlockCommand({
            Bucket: BUCKET_NAME,
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,           // Block public ACLs
                IgnorePublicAcls: true,          // Ignore public ACLs
                BlockPublicPolicy: false,        // Allow public bucket policies
                RestrictPublicBuckets: false     // Allow public bucket policies
            }
        }));
        
        // 2. Set bucket policy for public read access
        console.log('🛡️  Setting bucket policy for public read access...');
        const bucketPolicy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "PublicReadGetObject",
                    Effect: "Allow",
                    Principal: "*",
                    Action: "s3:GetObject",
                    Resource: `arn:aws:s3:::${BUCKET_NAME}/*`
                }
            ]
        };
        
        await s3Client.send(new PutBucketPolicyCommand({
            Bucket: BUCKET_NAME,
            Policy: JSON.stringify(bucketPolicy)
        }));
        
        console.log('✅ Bucket setup completed successfully!');
        console.log('📁 Your bucket is now configured for public read access without ACLs');
        console.log('🎵 You can now upload songs through the admin interface');
        
    } catch (error) {
        console.error('❌ Error setting up bucket:', error.message);
        console.log('💡 Alternative solution: Manually configure your S3 bucket:');
        console.log('   1. Go to AWS S3 Console');
        console.log('   2. Select your bucket:', BUCKET_NAME);
        console.log('   3. Go to Permissions tab');
        console.log('   4. Edit "Block public access" and uncheck "Block public policy" and "Block public bucket policies"');
        console.log('   5. Add this bucket policy:');
        console.log(JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "PublicReadGetObject",
                    Effect: "Allow",
                    Principal: "*",
                    Action: "s3:GetObject",
                    Resource: `arn:aws:s3:::${BUCKET_NAME}/*`
                }
            ]
        }, null, 2));
    }
}

// Run the setup
setupBucketForPublicRead();
