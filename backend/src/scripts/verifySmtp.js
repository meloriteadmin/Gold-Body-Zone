import { env } from '../config/env.js';
import {
  sendTestEmail,
  verifySmtpConnection,
} from '../services/email.service.js';

function maskPassword(pass) {
  if (!pass) return '[not set]';
  if (pass.length <= 4) return '***';
  return `${pass.slice(0, 4)}...${pass.slice(-2)} (len:${pass.length})`;
}

async function main() {
  console.log('====================================================');
  console.log('     GOLD BODY ZONE SMTP Connection & Delivery Test ');
  console.log('====================================================');

  console.log('\n[1] Checking Configured Environment Variables:');
  console.log(`    - SMTP_HOST:   ${env.smtpHost || '[not set]'}`);
  console.log(`    - SMTP_PORT:   ${env.smtpPort}`);
  console.log(`    - SMTP_SECURE: ${env.smtpSecure}`);
  console.log(`    - SMTP_USER:   ${env.smtpUser || '[not set]'}`);
  console.log(`    - SMTP_PASS:   ${maskPassword(env.smtpPass)}`);
  console.log(`    - SMTP_FROM:   ${env.emailFrom || '[not set]'}`);
  console.log(`    - Configured:  ${env.isEmailConfigured}`);

  if (!env.isEmailConfigured) {
    console.error('\n❌ SMTP is not fully configured. Missing required variables.');
    process.exit(1);
  }

  console.log('\n[2] Verifying SMTP Connection (transporter.verify())...');
  const verifyResult = await verifySmtpConnection();

  if (!verifyResult.success) {
    console.error('❌ SMTP Connection Verification FAILED:');
    console.error(`   Message: ${verifyResult.message}`);
    if (verifyResult.code) console.error(`   Code: ${verifyResult.code}`);
    process.exit(1);
  }

  console.log('✅ SMTP Connection & Authentication VERIFIED successfully!');
  console.log(`   Host: ${verifyResult.host}:${verifyResult.port}`);
  console.log(`   User: ${verifyResult.user}`);

  console.log(`\n[3] Sending Test Email to ${env.smtpUser}...`);
  const sendResult = await sendTestEmail(env.smtpUser);

  if (!sendResult.sent) {
    console.error('❌ Test email delivery FAILED:');
    console.error(`   Message: ${sendResult.message}`);
    process.exit(1);
  }

  console.log('✅ Test email SENT successfully!');
  console.log(`   Recipient:  ${sendResult.recipient}`);
  console.log(`   Message ID: ${sendResult.messageId}`);
  if (sendResult.response) {
    console.log(`   Server Response: ${sendResult.response}`);
  }
  console.log('\n====================================================');
  console.log('      All SMTP verification checks PASSED!          ');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('Unexpected error running SMTP verification script:', err);
  process.exit(1);
});
