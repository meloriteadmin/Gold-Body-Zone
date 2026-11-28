import crypto from 'node:crypto';
import { env } from '../src/config/env.js';
import { getPrismaClient } from '../src/config/prisma.js';

const TEST_SLUG = 'test-client-rehearsal-2026';
const TEST_PREFIX = 'TEST-GBZ-2026-';
const eventDate = new Date('2026-11-28T04:30:00.000Z');

function assertLocalDatabase() {
  if (!env.isDatabaseConfigured) {
    throw new Error('DATABASE_URL is not configured in backend/.env.');
  }
  const parsed = new URL(process.env.DATABASE_URL);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'db']);
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing to add rehearsal records to non-local database host "${parsed.hostname}".`
    );
  }
}

async function upsertCategory(prisma, competitionId, data) {
  const existing = await prisma.competitionCategory.findFirst({
    where: { competitionId, name: data.name },
  });
  if (existing) {
    return prisma.competitionCategory.update({ where: { id: existing.id }, data });
  }
  return prisma.competitionCategory.create({ data: { competitionId, ...data } });
}

async function upsertGroup(prisma, categoryId, name, sortOrder) {
  const existing = await prisma.categoryGroup.findFirst({ where: { categoryId, name } });
  if (existing) {
    return prisma.categoryGroup.update({ where: { id: existing.id }, data: { sortOrder } });
  }
  return prisma.categoryGroup.create({ data: { categoryId, name, sortOrder } });
}

function participant(index, overrides = {}) {
  const firstNames = [
    'Aarav', 'Vihaan', 'Aditya', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna',
    'Ishaan', 'Shaurya', 'Atharv', 'Kabir', 'Rohan', 'Nikhil', 'Pranav', 'Kunal',
    'Siddharth', 'Manav', 'Harsh',
  ];
  const lastNames = [
    'Patil', 'Shinde', 'Jadhav', 'Pawar', 'Deshmukh', 'More', 'Kadam', 'Chavan',
    'Gaikwad', 'Kulkarni', 'Joshi', 'Mane', 'Wagh', 'Borse', 'Sonawane', 'Raut',
    'Thakur', 'Mahajan', 'Kale',
  ];
  const n = String(index).padStart(3, '0');
  return {
    registrationCode: `${TEST_PREFIX}${n}`,
    participantName: `${firstNames[index - 1]} ${lastNames[index - 1]}`,
    email: `rehearsal.participant${n}@example.test`,
    mobileNumber: `90000${String(10000 + index).slice(-5)}`,
    gender: 'MALE',
    age: 20 + (index % 15),
    heightCm: 162 + index,
    weightKg: 48 + index,
    district: index % 2 ? 'Nashik' : 'Dhule',
    representingType: index % 4 === 0 ? 'INDIVIDUAL' : 'GYM',
    gymName: index % 4 === 0 ? 'Other / Individual' : `Rehearsal Fitness Club ${((index - 1) % 3) + 1}`,
    aadhaarLast4: String(7000 + index),
    registrationStatus: 'CONFIRMED',
    paymentStatus: 'PAID',
    trunkNumber: 100 + index,
    isManual: index % 3 === 0,
    paymentMethod: index % 3 === 0 ? 'CASH' : 'TEST_PAYMENT',
    verifiedAt: index <= 12 ? new Date('2026-11-27T06:30:00.000Z') : null,
    ...overrides,
  };
}

function categoryMeasurement(category, personIndex) {
  const name = String(category.name || '').toLowerCase().replace(/[–—]/g, '-');
  const type = category.categoryType;
  const range = name.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (type === 'WEIGHT' && range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    const weightKg = Number((min + ((max - min) * ((personIndex % 30) + 1)) / 31).toFixed(1));
    return { weightKg, heightCm: 165 + (personIndex % 16) };
  }
  const upper = name.match(/(?:under|below|upto|up to|less than|<)\s*(\d+(?:\.\d+)?)/);
  const lower = name.match(/(?:above|over|more than|>)\s*(\d+(?:\.\d+)?)/) || name.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (type === 'HEIGHT' && upper) return { heightCm: Number(upper[1]) - 1 - (personIndex % 3), weightKg: 65 + (personIndex % 8) };
  if (type === 'HEIGHT' && lower) return { heightCm: Number(lower[1]) + 1 + (personIndex % 12), weightKg: 65 + (personIndex % 8) };
  if (type === 'HEIGHT' && range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    return { heightCm: Number((min + ((max - min) * ((personIndex % 30) + 1)) / 31).toFixed(1)), weightKg: 65 + (personIndex % 8) };
  }
  return { heightCm: 165 + (personIndex % 16), weightKg: 60 + (personIndex % 16) };
}

async function seedDefaultCompetitionRehearsals(prisma) {
  const competitions = await prisma.competition.findMany({
    where: { isDefault: true },
    include: {
      categories: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { groups: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const maleNames = [
    'Omkar Patil', 'Yash Shinde', 'Rahul Jadhav', 'Akash Pawar', 'Sanket More',
    'Tejas Kadam', 'Rohit Chavan', 'Vishal Gaikwad', 'Amit Wagh', 'Nilesh Raut',
  ];
  const femaleNames = [
    'Aarohi Patil', 'Anaya Shinde', 'Diya Jadhav', 'Isha Pawar', 'Kavya More',
    'Meera Kadam', 'Riya Chavan', 'Saanvi Gaikwad', 'Tanvi Wagh', 'Zoya Raut',
  ];
  const summaries = [];

  for (let competitionIndex = 0; competitionIndex < competitions.length; competitionIndex += 1) {
    const competition = competitions[competitionIndex];
    if (competition.categories.length === 0) continue;
    const prefix = `TEST-${competition.slug.toUpperCase()}-`;
    const trunkBase = (competitionIndex + 2) * 100;
    let serial = 0;

    for (let categoryIndex = 0; categoryIndex < competition.categories.length; categoryIndex += 1) {
      const category = competition.categories[categoryIndex];
      for (let personIndex = 0; personIndex < 8; personIndex += 1) {
        serial += 1;
        const number = String(serial).padStart(3, '0');
        const female = category.gender === 'FEMALE' || competition.genderEligibility === 'FEMALE_ONLY';
        const names = female ? femaleNames : maleNames;
        const group = category.groups.length
          ? category.groups[personIndex % category.groups.length]
          : null;
        const registrationCode = `${prefix}${number}`;
        const measurement = categoryMeasurement(category, personIndex);
        const data = {
          competitionId: competition.id,
          categoryId: category.id,
          groupId: group?.id || null,
          groupName: group?.name || null,
          participantName: `${names[(serial - 1) % names.length]} Test ${competitionIndex + 1}`,
          email: `rehearsal.${competition.slug}.${number}@example.test`,
          mobileNumber: `92${competitionIndex}${String(1000000 + serial).slice(-7)}`,
          gender: female ? 'FEMALE' : 'MALE',
          age: competition.slug === 'masters' ? 43 + personIndex : 21 + ((serial + categoryIndex) % 14),
          ...measurement,
          district: personIndex % 2 ? 'Dhule' : 'Nashik',
          representingType: personIndex === 3 ? 'INDIVIDUAL' : 'GYM',
          gymName: personIndex === 3 ? 'Other / Individual' : `Test Gym ${categoryIndex + 1}`,
          aadhaarLast4: String(8000 + competitionIndex * 100 + serial),
          registrationStatus: 'CONFIRMED',
          paymentStatus: 'PAID',
          trunkNumber: trunkBase + serial,
          isManual: serial % 2 === 0,
          paymentMethod: serial % 2 === 0 ? 'CASH' : 'TEST_PAYMENT',
          verifiedAt: personIndex < 6 ? new Date('2026-11-27T06:30:00.000Z') : null,
        };
        await prisma.registration.upsert({
          where: { registrationCode },
          update: data,
          create: { registrationCode, ...data },
        });
      }
      for (let extraIndex = 1; extraIndex <= 30; extraIndex += 1) {
        const number = String(extraIndex).padStart(3, '0');
        const group = category.groups.length ? category.groups[(extraIndex - 1) % category.groups.length] : null;
        const measurement = categoryMeasurement(category, extraIndex - 1);
        const registrationCode = `${prefix}EXTRA-${String(categoryIndex + 1).padStart(2, '0')}-${number}`;
        await prisma.registration.upsert({
          where: { registrationCode },
          update: {
            competitionId: competition.id, categoryId: category.id, groupId: group?.id || null,
            groupName: group?.name || null, participantName: `Extra Participant ${categoryIndex + 1}-${number}`,
            email: `extra.${competition.slug}.${categoryIndex + 1}.${number}@example.test`,
            mobileNumber: `95${competitionIndex}${String(2000000 + categoryIndex * 100 + extraIndex).slice(-7)}`,
            gender: category.gender === 'FEMALE' ? 'FEMALE' : 'MALE', age: 21 + (extraIndex % 20), ...measurement,
            district: extraIndex % 2 ? 'Nashik' : 'Dhule', representingType: 'GYM', gymName: `Extra Test Gym ${categoryIndex + 1}`,
            aadhaarLast4: String(6000 + competitionIndex * 100 + categoryIndex * 30 + extraIndex),
            registrationStatus: 'CONFIRMED', paymentStatus: 'PAID', trunkNumber: 10000 + categoryIndex * 100 + extraIndex,
            isManual: extraIndex % 2 === 0, paymentMethod: extraIndex % 2 === 0 ? 'CASH' : 'TEST_PAYMENT', verifiedAt: null,
          },
          create: {
            registrationCode, competitionId: competition.id, categoryId: category.id, groupId: group?.id || null,
            groupName: group?.name || null, participantName: `Extra Participant ${categoryIndex + 1}-${number}`,
            email: `extra.${competition.slug}.${categoryIndex + 1}.${number}@example.test`,
            mobileNumber: `95${competitionIndex}${String(2000000 + categoryIndex * 100 + extraIndex).slice(-7)}`,
            gender: category.gender === 'FEMALE' ? 'FEMALE' : 'MALE', age: 21 + (extraIndex % 20), ...measurement,
            district: extraIndex % 2 ? 'Nashik' : 'Dhule', representingType: 'GYM', gymName: `Extra Test Gym ${categoryIndex + 1}`,
            aadhaarLast4: String(6000 + competitionIndex * 100 + categoryIndex * 30 + extraIndex),
            registrationStatus: 'CONFIRMED', paymentStatus: 'PAID', trunkNumber: 10000 + categoryIndex * 100 + extraIndex,
            isManual: extraIndex % 2 === 0, paymentMethod: extraIndex % 2 === 0 ? 'CASH' : 'TEST_PAYMENT', verifiedAt: null,
          },
        });
      }
    }

    const firstCategory = competition.categories[0];
    const lastCategory = competition.categories[competition.categories.length - 1];
    const edgeDefinitions = [
      {
        suffix: 'MISSING-TRUNK',
        category: firstCategory,
        participantName: `Missing Trunk Test ${competitionIndex + 1}`,
        registrationStatus: 'CONFIRMED',
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        isManual: true,
      },
      {
        suffix: 'PENDING-PAYMENT',
        category: lastCategory,
        participantName: `Pending Payment Test ${competitionIndex + 1}`,
        registrationStatus: 'PENDING',
        paymentStatus: 'PENDING',
        paymentMethod: null,
        isManual: false,
      },
    ];

    for (let edgeIndex = 0; edgeIndex < edgeDefinitions.length; edgeIndex += 1) {
      const edge = edgeDefinitions[edgeIndex];
      const group = edge.category.groups[0] || null;
      const registrationCode = `${prefix}${edge.suffix}`;
      const female = edge.category.gender === 'FEMALE' || competition.genderEligibility === 'FEMALE_ONLY';
      const data = {
        competitionId: competition.id,
        categoryId: edge.category.id,
        groupId: group?.id || null,
        groupName: group?.name || null,
        participantName: edge.participantName,
        email: `rehearsal.${competition.slug}.${edge.suffix.toLowerCase()}@example.test`,
        mobileNumber: `93${competitionIndex}${String(1000000 + edgeIndex).slice(-7)}`,
        gender: female ? 'FEMALE' : 'MALE',
        age: competition.slug === 'masters' ? 47 : 29,
        heightCm: 170,
        weightKg: 60,
        district: 'Nashik',
        representingType: 'GYM',
        gymName: 'Rehearsal Edge Case Gym',
        aadhaarLast4: String(8900 + competitionIndex * 10 + edgeIndex),
        registrationStatus: edge.registrationStatus,
        paymentStatus: edge.paymentStatus,
        trunkNumber: null,
        isManual: edge.isManual,
        paymentMethod: edge.paymentMethod,
        verifiedAt: null,
      };
      await prisma.registration.upsert({
        where: { registrationCode },
        update: data,
        create: { registrationCode, ...data },
      });
    }

    for (let judgeIndex = 1; judgeIndex <= 3; judgeIndex += 1) {
      const name = `Test ${competition.name} Judge ${judgeIndex}`;
      let judge = await prisma.judge.findFirst({ where: { competitionId: competition.id, name } });
      if (!judge) {
        judge = await prisma.judge.create({
          data: {
            competitionId: competition.id,
            name,
            email: `rehearsal.${competition.slug}.judge${judgeIndex}@example.test`,
            phone: `94${competitionIndex}${String(1000000 + judgeIndex).slice(-7)}`,
            city: 'Nashik',
            designation: 'Test Judge',
          },
        });
      }
      await prisma.competitionJudge.upsert({
        where: { competitionId_judgeId: { competitionId: competition.id, judgeId: judge.id } },
        update: {},
        create: {
          competitionId: competition.id,
          judgeId: judge.id,
          accessToken: crypto.randomBytes(24).toString('hex'),
        },
      });
    }

    summaries.push({
      competition: competition.name,
      participants: serial + edgeDefinitions.length,
      categories: competition.categories.length,
      judges: 3,
    });
  }

  return summaries;
}

async function main() {
  assertLocalDatabase();
  const prisma = getPrismaClient();

  try {
    const competition = await prisma.competition.upsert({
      where: { slug: TEST_SLUG },
      update: {
        name: '[TEST] Client Rehearsal Championship',
        description: 'Dummy data only. Safe rehearsal competition for end-to-end acceptance testing.',
        eventDate,
        registrationDeadline: new Date('2026-11-27T18:29:00.000Z'),
        venue: 'TEST VENUE — Do Not Use For Real Event',
        registrationFee: 200,
        maxParticipants: 100,
        genderEligibility: 'ALL',
        isPublished: true,
        isCompleted: false,
        completedAt: null,
        isRegistrationClosed: false,
      },
      create: {
        slug: TEST_SLUG,
        name: '[TEST] Client Rehearsal Championship',
        competitionType: 'Bodybuilding Rehearsal',
        description: 'Dummy data only. Safe rehearsal competition for end-to-end acceptance testing.',
        eventDate,
        registrationDeadline: new Date('2026-11-27T18:29:00.000Z'),
        venue: 'TEST VENUE — Do Not Use For Real Event',
        registrationFee: 200,
        maxParticipants: 100,
        genderEligibility: 'ALL',
        isPublished: true,
        publishedAt: new Date(),
        isDefault: false,
      },
    });

    const weightLight = await upsertCategory(prisma, competition.id, {
      name: '0–55 kg', categoryType: 'WEIGHT', gender: 'MALE', sortOrder: 1,
      ruleNote: 'Test weight category: up to 55 kg',
    });
    const weightMiddle = await upsertCategory(prisma, competition.id, {
      name: '55–65 kg', categoryType: 'WEIGHT', gender: 'MALE', sortOrder: 2,
      ruleNote: 'Test weight category: over 55 kg and up to 65 kg',
    });
    const height = await upsertCategory(prisma, competition.id, {
      name: 'Under 175 cm', categoryType: 'HEIGHT', gender: 'MALE', sortOrder: 3,
      ruleNote: 'Test height category',
    });
    const open = await upsertCategory(prisma, competition.id, {
      name: 'Open Physique', categoryType: 'OPEN', gender: 'OPEN', sortOrder: 4,
      ruleNote: 'Test grouped open category',
    });
    const novice = await upsertGroup(prisma, open.id, 'Novice', 1);
    const senior = await upsertGroup(prisma, open.id, 'Senior', 2);

    const definitions = [
      ...[1, 2, 3, 4].map((i) => ({ ...participant(i, { weightKg: 50 + i }), categoryId: weightLight.id })),
      ...[5, 6, 7, 8].map((i) => ({ ...participant(i, { weightKg: 55 + i }), categoryId: weightMiddle.id })),
      ...[9, 10, 11, 12].map((i) => ({ ...participant(i, { heightCm: 160 + i }), categoryId: height.id })),
      ...[13, 14].map((i) => ({ ...participant(i), categoryId: open.id, groupId: novice.id, groupName: novice.name })),
      ...[15, 16].map((i) => ({ ...participant(i), categoryId: open.id, groupId: senior.id, groupName: senior.name })),
      {
        ...participant(17, { weightKg: 54, trunkNumber: null, verifiedAt: null }),
        categoryId: weightLight.id,
      },
      {
        ...participant(18, {
          registrationStatus: 'PENDING', paymentStatus: 'PENDING', trunkNumber: null,
          weightKg: 64, verifiedAt: null, isManual: false, paymentMethod: null,
        }),
        categoryId: weightMiddle.id,
      },
      {
        ...participant(19, {
          registrationStatus: 'CANCELLED', paymentStatus: 'FAILED', trunkNumber: null,
          heightCm: 174, verifiedAt: null, isManual: false, paymentMethod: 'TEST_PAYMENT',
        }),
        categoryId: height.id,
      },
    ];

    for (const item of definitions) {
      const { registrationCode, ...data } = item;
      await prisma.registration.upsert({
        where: { registrationCode },
        update: { competitionId: competition.id, ...data },
        create: { registrationCode, competitionId: competition.id, ...data },
      });
    }
    for (const [categoryIndex, category] of [weightLight, weightMiddle, height, open].entries()) {
      for (let extraIndex = 1; extraIndex <= 30; extraIndex += 1) {
        const number = String(extraIndex).padStart(3, '0');
        const group = category === open ? (extraIndex % 2 ? novice : senior) : null;
        const measurement = categoryMeasurement(category, extraIndex - 1);
        const registrationCode = `${TEST_PREFIX}EXTRA-${categoryIndex + 1}-${number}`;
        await prisma.registration.upsert({
          where: { registrationCode },
          update: { competitionId: competition.id, categoryId: category.id, groupId: group?.id || null, groupName: group?.name || null, participantName: `Extra Rehearsal ${categoryIndex + 1}-${number}`, email: `extra.rehearsal.${categoryIndex + 1}.${number}@example.test`, mobileNumber: `96${String(3000000 + categoryIndex * 100 + extraIndex).slice(-8)}`, gender: 'MALE', age: 22 + (extraIndex % 18), ...measurement, district: 'Nashik', representingType: 'GYM', gymName: 'Extra Rehearsal Gym', aadhaarLast4: String(6500 + categoryIndex * 30 + extraIndex), registrationStatus: 'CONFIRMED', paymentStatus: 'PAID', trunkNumber: 11000 + categoryIndex * 100 + extraIndex, isManual: extraIndex % 2 === 0, paymentMethod: 'TEST_PAYMENT', verifiedAt: null },
          create: { registrationCode, competitionId: competition.id, categoryId: category.id, groupId: group?.id || null, groupName: group?.name || null, participantName: `Extra Rehearsal ${categoryIndex + 1}-${number}`, email: `extra.rehearsal.${categoryIndex + 1}.${number}@example.test`, mobileNumber: `96${String(3000000 + categoryIndex * 100 + extraIndex).slice(-8)}`, gender: 'MALE', age: 22 + (extraIndex % 18), ...measurement, district: 'Nashik', representingType: 'GYM', gymName: 'Extra Rehearsal Gym', aadhaarLast4: String(6500 + categoryIndex * 30 + extraIndex), registrationStatus: 'CONFIRMED', paymentStatus: 'PAID', trunkNumber: 11000 + categoryIndex * 100 + extraIndex, isManual: extraIndex % 2 === 0, paymentMethod: 'TEST_PAYMENT', verifiedAt: null },
        });
      }
    }

    const judgeNames = ['Test Judge One', 'Test Judge Two', 'Test Judge Three'];
    for (let index = 0; index < judgeNames.length; index += 1) {
      const name = judgeNames[index];
      let judge = await prisma.judge.findFirst({ where: { competitionId: competition.id, name } });
      if (!judge) {
        judge = await prisma.judge.create({
          data: {
            competitionId: competition.id,
            name,
            email: `rehearsal.judge${index + 1}@example.test`,
            phone: `91111${String(10001 + index).slice(-5)}`,
            city: 'Nashik',
            designation: 'Test Judge',
          },
        });
      }
      await prisma.competitionJudge.upsert({
        where: { competitionId_judgeId: { competitionId: competition.id, judgeId: judge.id } },
        update: {},
        create: {
          competitionId: competition.id,
          judgeId: judge.id,
          accessToken: crypto.randomBytes(24).toString('hex'),
        },
      });
    }

    const defaultCompetitionSummaries = await seedDefaultCompetitionRehearsals(prisma);

    const counts = await prisma.registration.groupBy({
      by: ['registrationStatus', 'paymentStatus'],
      where: { competitionId: competition.id },
      _count: { _all: true },
    });
    console.log('[rehearsal-seed] Ready:', competition.name);
    console.log('[rehearsal-seed] Competition ID:', competition.id);
    console.log('[rehearsal-seed] 19 participants, 4 categories, 2 groups, 3 judges.');
    console.log('[rehearsal-seed] Status counts:', JSON.stringify(counts));
    console.log('[rehearsal-seed] Default competitions:', JSON.stringify(defaultCompetitionSummaries));
    console.log('[rehearsal-seed] Only TEST-* rehearsal records were created/updated.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[rehearsal-seed] Failed:', error);
  process.exit(1);
});
