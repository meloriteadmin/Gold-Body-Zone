import { env } from '../config/env.js';
import { getPrismaClient } from '../config/prisma.js';
import { getSupabaseAdmin } from '../config/supabase.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

async function main() {
  if (!env.isDatabaseConfigured || !env.isSupabaseConfigured) {
    throw new Error(
      'DATABASE_URL, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env.'
    );
  }

  const args = parseArgs(process.argv.slice(2));
  const email = (args.email || '').trim().toLowerCase();
  const password = args.password || '';
  const fullName = args.name ? args.name.trim() : null;
  const role = args.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN';

  if (!email || !password || password.length < 8) {
    throw new Error(
      'Usage: npm run admin:provision -- --email admin@domain.com --password "<min-8-chars>" [--name "Admin Name"] [--role ADMIN|SUPER_ADMIN]'
    );
  }

  const supabase = getSupabaseAdmin();
  const prisma = getPrismaClient();

  const { data: listData, error: listError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    throw new Error(`Failed to query Supabase Auth users: ${listError.message}`);
  }

  let authUser = listData.users.find(
    (u) => u.email?.toLowerCase() === email
  );

  if (!authUser) {
    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: 'admin' },
        user_metadata: fullName ? { full_name: fullName } : {},
      });
    if (createError) {
      throw new Error(`Failed to create Supabase Auth user: ${createError.message}`);
    }
    authUser = created.user;
    console.log(`[admin:provision] Created Supabase Auth user for ${email}.`);
  } else {
    const { data: updated, error: updateError } =
      await supabase.auth.admin.updateUserById(authUser.id, {
        app_metadata: { ...(authUser.app_metadata || {}), role: 'admin' },
      });
    if (updateError) {
      throw new Error(`Failed to update user metadata: ${updateError.message}`);
    }
    authUser = updated.user;
    console.log(`[admin:provision] Linked existing Supabase Auth user ${email}.`);
  }

  const profile = await prisma.adminProfile.upsert({
    where: { authUserId: authUser.id },
    update: {
      email,
      ...(fullName ? { fullName } : {}),
      role,
      isActive: true,
    },
    create: {
      authUserId: authUser.id,
      email,
      fullName,
      role,
      isActive: true,
    },
  });

  console.log(
    `[admin:provision] Admin profile active: id=${profile.id}, email=${profile.email}, role=${profile.role}`
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[admin:provision] Error:', err.message);
  process.exit(1);
});
