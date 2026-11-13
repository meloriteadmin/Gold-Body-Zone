import { getPrismaClient } from '../config/prisma.js';
import { COMPETITION_TYPE_CONFIGS } from '../constants/competitionTypes.js';
import {
  deleteImageFromBucket,
  uploadImageToBucket,
} from '../services/storage.service.js';
import {
  makeUniqueSlug,
  normalizeCategoryInput,
  validateCompetitionPayload,
} from '../utils/competitionValidation.js';
import { HttpError } from '../utils/httpError.js';
import {
  serializeAdminProfile,
  serializeCompetition,
} from '../utils/serializers.js';

export async function getDashboardOverview(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const [totalCompetitions, publishedCompetitions, competitions] =
      await Promise.all([
        prisma.competition.count(),
        prisma.competition.count({ where: { isPublished: true } }),
        prisma.competition.findMany({
          include: {
            categories: { orderBy: { sortOrder: 'asc' } },
          },
          orderBy: [{ createdAt: 'asc' }],
        }),
      ]);

    const draftCompetitions = totalCompetitions - publishedCompetitions;

    res.status(200).json({
      admin: serializeAdminProfile(req.admin, req.authUser),
      stats: {
        totalCompetitions,
        publishedCompetitions,
        draftCompetitions,
      },
      competitions: competitions.map(serializeCompetition),
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminProfile(req, res, next) {
  try {
    res.status(200).json({
      profile: serializeAdminProfile(req.admin, req.authUser),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateAdminProfile(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const fullName =
      req.body.fullName !== undefined
        ? typeof req.body.fullName === 'string' && req.body.fullName.trim()
          ? req.body.fullName.trim()
          : null
        : undefined;

    const updated = await prisma.adminProfile.update({
      where: { id: req.admin.id },
      data: {
        ...(fullName !== undefined ? { fullName } : {}),
      },
    });

    res.status(200).json({
      profile: serializeAdminProfile(updated, req.authUser),
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadAdminAvatar(req, res, next) {
  try {
    if (!req.file) {
      throw new HttpError(400, 'Image file is required.');
    }

    const { publicUrl, storagePath } = await uploadImageToBucket(
      req.file,
      'avatars'
    );

    const prisma = getPrismaClient();
    const previousStoragePath = req.admin.avatarStoragePath;

    const updated = await prisma.adminProfile.update({
      where: { id: req.admin.id },
      data: {
        avatarUrl: publicUrl,
        avatarStoragePath: storagePath,
      },
    });

    if (previousStoragePath) {
      await deleteImageFromBucket(previousStoragePath);
    }

    res.status(200).json({
      profile: serializeAdminProfile(updated, req.authUser),
    });
  } catch (err) {
    next(err);
  }
}

export async function listCompetitions(_req, res, next) {
  try {
    const prisma = getPrismaClient();
    const competitions = await prisma.competition.findMany({
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    res.status(200).json({
      competitions: competitions.map(serializeCompetition),
    });
  } catch (err) {
    next(err);
  }
}

export async function createCompetition(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const { data, categories } = validateCompetitionPayload(req.body, {
      isUpdate: false,
    });

    const typeConfig = COMPETITION_TYPE_CONFIGS[data.competitionType];
    let finalCategories = categories;

    if (!finalCategories || finalCategories.length === 0) {
      if (typeConfig?.categories) {
        finalCategories = typeConfig.categories;
      }
    }

    if (data.competitionType === 'Masters') {
      data.ageEligibility = 'Above 40 years of age';
    }

    const created = await prisma.competition.create({
      data: {
        ...data,
        slug: makeUniqueSlug(data.name),
        isDefault: false,
        categories:
          finalCategories && finalCategories.length > 0
            ? {
                create: finalCategories.map(({ id: _ignored, ...rest }) => rest),
              }
            : undefined,
      },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.status(201).json({
      competition: serializeCompetition(created),
    });
  } catch (err) {
    next(err);
  }
}

async function syncCompetitionCategories(tx, competitionId, incomingCategories) {
  const existingCategories = await tx.competitionCategory.findMany({
    where: { competitionId },
    include: {
      _count: {
        select: { registrations: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const existingById = new Map(existingCategories.map((cat) => [cat.id, cat]));
  const matchedExistingIds = new Set();
  const matchedPairs = [];
  const toCreate = [];

  for (const incoming of incomingCategories) {
    let matched = null;

    if (incoming.id && existingById.has(incoming.id)) {
      const candidate = existingById.get(incoming.id);
      if (!matchedExistingIds.has(candidate.id)) {
        matched = candidate;
      }
    }

    if (!matched) {
      const targetGender = incoming.gender;
      const targetName = incoming.name.toLowerCase();
      matched = existingCategories.find(
        (candidate) =>
          !matchedExistingIds.has(candidate.id) &&
          candidate.gender === targetGender &&
          candidate.name.trim().toLowerCase() === targetName
      );
    }

    if (matched) {
      matchedExistingIds.add(matched.id);
      matchedPairs.push({ existing: matched, incoming });
    } else {
      const { id: _ignored, ...createData } = incoming;
      toCreate.push(createData);
    }
  }

  const toDelete = existingCategories.filter(
    (cat) => !matchedExistingIds.has(cat.id)
  );

  const blockedDeletes = toDelete.filter(
    (cat) => (cat._count?.registrations || 0) > 0
  );
  if (blockedDeletes.length > 0) {
    const details = blockedDeletes
      .map(
        (cat) =>
          `"${cat.name}" (${cat._count.registrations} registration${
            cat._count.registrations === 1 ? '' : 's'
          })`
      )
      .join(', ');
    throw new HttpError(
      400,
      `Cannot remove ${
        blockedDeletes.length === 1 ? 'category' : 'categories'
      } with existing registrations: ${details}.`
    );
  }

  if (toDelete.length > 0) {
    await tx.competitionCategory.deleteMany({
      where: {
        competitionId,
        id: { in: toDelete.map((cat) => cat.id) },
      },
    });
  }

  for (const { existing, incoming } of matchedPairs) {
    const hasChanges =
      existing.categoryType !== incoming.categoryType ||
      existing.gender !== incoming.gender ||
      existing.name !== incoming.name ||
      (existing.ruleNote || null) !== (incoming.ruleNote || null) ||
      existing.sortOrder !== incoming.sortOrder;

    if (hasChanges) {
      await tx.competitionCategory.update({
        where: { id: existing.id },
        data: {
          categoryType: incoming.categoryType,
          gender: incoming.gender,
          name: incoming.name,
          ruleNote: incoming.ruleNote,
          sortOrder: incoming.sortOrder,
        },
      });
    }
  }

  for (const createData of toCreate) {
    await tx.competitionCategory.create({
      data: {
        competitionId,
        ...createData,
      },
    });
  }
}

export async function updateCompetition(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.competition.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Competition not found.');
    }

    const { data, categories } = validateCompetitionPayload(req.body, {
      isUpdate: true,
    });

    if (data.isPublished !== undefined) {
      data.publishedAt = data.isPublished
        ? existing.publishedAt || new Date()
        : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (categories !== undefined) {
        await syncCompetitionCategories(tx, existing.id, categories);
      }

      return tx.competition.update({
        where: { id: existing.id },
        data,
        include: {
          categories: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    res.status(200).json({
      competition: serializeCompetition(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCompetition(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.competition.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Competition not found.');
    }

    const regCount = await prisma.registration.count({
      where: { competitionId: existing.id },
    });
    if (regCount > 0) {
      throw new HttpError(
        400,
        `Cannot delete competition "${existing.name}" because it has ${regCount} existing participant registration${regCount === 1 ? '' : 's'}.`
      );
    }

    const previousStoragePath = existing.posterStoragePath;

    await prisma.competitionCategory.deleteMany({
      where: { competitionId: existing.id },
    });

    await prisma.competition.delete({
      where: { id: existing.id },
    });

    if (previousStoragePath) {
      await safeDeletePosterStorageFile(prisma, previousStoragePath);
    }

    res.status(200).json({ deleted: true, id: existing.id });
  } catch (err) {
    next(err);
  }
}

export async function setCompetitionPublishStatus(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.competition.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Competition not found.');
    }

    const nextPublished =
      req.body.isPublished !== undefined
        ? Boolean(req.body.isPublished)
        : !existing.isPublished;

    const updated = await prisma.competition.update({
      where: { id: existing.id },
      data: {
        isPublished: nextPublished,
        publishedAt: nextPublished ? existing.publishedAt || new Date() : null,
      },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.status(200).json({
      competition: serializeCompetition(updated),
    });
  } catch (err) {
    next(err);
  }
}

const PROTECTED_POSTER_PATHS = new Set([
  'bodybuilding-poster.jpg',
  'mens-physique-poster.jpg',
  'masters-poster.jpg',
  ' masters-poster.jpg',
]);

async function safeDeletePosterStorageFile(prisma, storagePath) {
  if (!storagePath || typeof storagePath !== 'string') return;
  const trimmed = storagePath.trim();
  if (PROTECTED_POSTER_PATHS.has(trimmed)) {
    return;
  }

  // Never delete a file still referenced by another competition
  const otherRef = await prisma.competition.findFirst({
    where: {
      posterStoragePath: trimmed,
    },
    select: { id: true },
  });

  if (!otherRef) {
    try {
      await deleteImageFromBucket(trimmed);
    } catch (err) {
      console.warn(
        `[storage] Could not delete unused poster file ${trimmed}:`,
        err?.message || err
      );
    }
  }
}

export async function uploadCompetitionPoster(req, res, next) {
  try {
    if (!req.file) {
      throw new HttpError(400, 'Poster image file is required.');
    }

    const prisma = getPrismaClient();
    const existing = await prisma.competition.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Competition not found.');
    }

    const { publicUrl, storagePath } = await uploadImageToBucket(
      req.file,
      'posters'
    );

    const previousStoragePath = existing.posterStoragePath;

    const updated = await prisma.competition.update({
      where: { id: existing.id },
      data: {
        posterUrl: publicUrl,
        posterStoragePath: storagePath,
      },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (previousStoragePath && previousStoragePath !== storagePath) {
      await safeDeletePosterStorageFile(prisma, previousStoragePath);
    }

    res.status(200).json({
      competition: serializeCompetition(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function removeCompetitionPoster(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.competition.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Competition not found.');
    }

    const previousStoragePath = existing.posterStoragePath;

    const updated = await prisma.competition.update({
      where: { id: existing.id },
      data: {
        posterUrl: null,
        posterStoragePath: null,
      },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (previousStoragePath) {
      await safeDeletePosterStorageFile(prisma, previousStoragePath);
    }

    res.status(200).json({
      competition: serializeCompetition(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function addCategory(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const competition = await prisma.competition.findUnique({
      where: { id: req.params.id },
      include: { categories: true },
    });

    if (!competition) {
      throw new HttpError(404, 'Competition not found.');
    }

    const normalized = normalizeCategoryInput(
      req.body,
      competition.categories.length
    );

    const category = await prisma.competitionCategory.create({
      data: {
        ...normalized,
        competitionId: competition.id,
      },
    });

    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.competitionCategory.findFirst({
      where: {
        id: req.params.categoryId,
        competitionId: req.params.id,
      },
    });

    if (!existing) {
      throw new HttpError(404, 'Category not found.');
    }

    const normalized = normalizeCategoryInput(
      { ...existing, ...req.body },
      existing.sortOrder - 1
    );

    const category = await prisma.competitionCategory.update({
      where: { id: existing.id },
      data: normalized,
    });

    res.status(200).json({ category });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.competitionCategory.findFirst({
      where: {
        id: req.params.categoryId,
        competitionId: req.params.id,
      },
    });

    if (!existing) {
      throw new HttpError(404, 'Category not found.');
    }

    await prisma.competitionCategory.delete({
      where: { id: existing.id },
    });

    res.status(200).json({ deleted: true, id: existing.id });
  } catch (err) {
    next(err);
  }
}
