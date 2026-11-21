import { getPrismaClient } from '../config/prisma.js';
import { COMPETITION_TYPE_CONFIGS } from '../constants/competitionTypes.js';
import {
  deleteImageFromBucket,
  uploadImageToBucket,
} from '../services/storage.service.js';
import {
  isPastEvent,
  makeUniqueSlug,
  normalizeCategoryInput,
  parseOptionalDate,
  validateCompetitionPayload,
} from '../utils/competitionValidation.js';
import { HttpError } from '../utils/httpError.js';
import {
  serializeAdminProfile,
  serializeCompetition,
  serializeRegistration,
} from '../utils/serializers.js';

export const ADMIN_COMPETITION_INCLUDE = {
  categories: {
    orderBy: { sortOrder: 'asc' },
    include: {
      groups: { orderBy: { sortOrder: 'asc' } },
    },
  },
  registrations: {
    select: {
      id: true,
      registrationStatus: true,
      paymentStatus: true,
      trunkNumber: true,
    },
  },
  photos: {
    orderBy: { sortOrder: 'asc' },
  },
};

export async function getDashboardOverview(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const [
      totalCompetitions,
      publishedCompetitions,
      completedCompetitions,
      competitions,
    ] = await Promise.all([
      prisma.competition.count(),
      prisma.competition.count({
        where: { isPublished: true, isCompleted: false },
      }),
      prisma.competition.count({ where: { isCompleted: true } }),
      prisma.competition.findMany({
        include: ADMIN_COMPETITION_INCLUDE,
        orderBy: [{ createdAt: 'asc' }],
      }),
    ]);

    const draftCompetitions = Math.max(
      0,
      totalCompetitions - publishedCompetitions - completedCompetitions
    );

    res.status(200).json({
      admin: serializeAdminProfile(req.admin),
      stats: {
        totalCompetitions,
        publishedCompetitions,
        completedCompetitions,
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
      profile: serializeAdminProfile(req.admin),
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
      profile: serializeAdminProfile(updated),
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

    let updated;
    try {
      updated = await prisma.adminProfile.update({
        where: { id: req.admin.id },
        data: { avatarUrl: publicUrl, avatarStoragePath: storagePath },
      });
    } catch (error) {
      await deleteImageFromBucket(storagePath).catch(() => {});
      throw error;
    }

    if (previousStoragePath) {
      await deleteImageFromBucket(previousStoragePath);
    }

    res.status(200).json({
      profile: serializeAdminProfile(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function listCompetitions(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const isHistory = req.query.history === 'true';
    const where = {};

    if (isHistory) {
      where.isCompleted = true;
      if (req.query.competitionType && req.query.competitionType !== 'ALL') {
        where.competitionType = req.query.competitionType;
      }
      if (req.query.year && req.query.year !== 'ALL') {
        const y = Number(req.query.year);
        if (!Number.isNaN(y)) {
          where.eventDate = {
            gte: new Date(Date.UTC(y, 0, 1)),
            lte: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)),
          };
        }
      }
      if (req.query.startDate || req.query.endDate) {
        const dateConditions = { ...(where.eventDate || {}) };
        if (req.query.startDate) {
          const start = new Date(req.query.startDate);
          start.setUTCHours(0, 0, 0, 0);
          dateConditions.gte = start;
        }
        if (req.query.endDate) {
          const end = new Date(req.query.endDate);
          end.setUTCHours(23, 59, 59, 999);
          dateConditions.lte = end;
        }
        where.eventDate = dateConditions;
      }
    } else if (req.query.history === 'false') {
      where.isCompleted = false;
    }

    const competitions = await prisma.competition.findMany({
      where,
      include: ADMIN_COMPETITION_INCLUDE,
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'asc' }],
    });

    res.status(200).json({
      competitions: competitions.map(serializeCompetition),
    });
  } catch (err) {
    next(err);
  }
}

export async function getCompetition(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const competition = await prisma.competition.findUnique({
      where: { id: req.params.id },
      include: {
        ...ADMIN_COMPETITION_INCLUDE,
        registrations: {
          include: {
            category: true,
            group: true,
            payment: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!competition) {
      throw new HttpError(404, 'Competition not found.');
    }

    res.status(200).json({
      competition: serializeCompetition(competition),
      registrations: (competition.registrations || []).map(serializeRegistration),
    });
  } catch (err) {
    next(err);
  }
}

export async function setRegistrationClosingStatus(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.competition.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Competition not found.');
    }

    const isClosed = Boolean(req.body.isRegistrationClosed);
    let newRegistrationDeadline = undefined;

    if (!isClosed) {
      if (existing.isCompleted) {
        throw new HttpError(
          400,
          'Cannot reopen registrations for a completed competition.'
        );
      }

      if (isPastEvent(existing.eventDate)) {
        throw new HttpError(
          400,
          'Cannot reopen registrations for an event that has already passed.'
        );
      }

      if (
        req.body.registrationDeadline !== undefined &&
        req.body.registrationDeadline !== null &&
        req.body.registrationDeadline !== ''
      ) {
        const parsed = parseOptionalDate(
          req.body.registrationDeadline,
          'Registration deadline'
        );
        if (!parsed) {
          throw new HttpError(400, 'Invalid registration deadline date.');
        }
        const deadlineDate = new Date(parsed);
        deadlineDate.setUTCHours(23, 59, 59, 999);
        if (new Date() > deadlineDate) {
          throw new HttpError(
            400,
            'Registration deadline must be a valid future date.'
          );
        }
        if (existing.eventDate) {
          const eventDate = new Date(existing.eventDate);
          eventDate.setUTCHours(23, 59, 59, 999);
          if (deadlineDate > eventDate) {
            throw new HttpError(
              400,
              'Registration deadline cannot be after the competition event date.'
            );
          }
        }
        newRegistrationDeadline = parsed;
      }

      if (!newRegistrationDeadline && existing.registrationDeadline) {
        const deadline = new Date(existing.registrationDeadline);
        deadline.setUTCHours(23, 59, 59, 999);
        if (new Date() > deadline) {
          throw new HttpError(
            400,
            'Cannot reopen registrations because the registration deadline has already passed. Please update the deadline to a valid future date first.'
          );
        }
      }
    }

    const updated = await prisma.competition.update({
      where: { id: existing.id },
      data: {
        isRegistrationClosed: isClosed,
        registrationClosedAt: isClosed ? new Date() : null,
        ...(newRegistrationDeadline !== undefined
          ? { registrationDeadline: newRegistrationDeadline }
          : {}),
      },
      include: ADMIN_COMPETITION_INCLUDE,
    });

    res.status(200).json({
      competition: serializeCompetition(updated),
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
        isPublished: false,
        publishedAt: null,
        slug: makeUniqueSlug(data.name),
        isDefault: false,
        categories:
          finalCategories && finalCategories.length > 0
            ? {
                create: finalCategories.map(
                  ({ id: _ignored, groups = [], ...rest }) => ({
                    ...rest,
                    groups:
                      groups && groups.length > 0
                        ? {
                            create: groups.map(
                              ({ id: _gId, ...gRest }) => gRest
                            ),
                          }
                        : undefined,
                  })
                ),
              }
            : undefined,
      },
      include: ADMIN_COMPETITION_INCLUDE,
    });

    res.status(201).json({
      competition: serializeCompetition(created),
    });
  } catch (err) {
    next(err);
  }
}

async function syncCategoryGroups(tx, categoryId, incomingGroups = []) {
  if (!tx.categoryGroup) {
    return;
  }
  const existingGroups = await tx.categoryGroup.findMany({
    where: { categoryId },
    include: {
      _count: {
        select: { registrations: true },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const existingById = new Map(existingGroups.map((g) => [g.id, g]));
  const matchedExistingIds = new Set();
  const matchedPairs = [];
  const toCreate = [];

  for (const incoming of incomingGroups) {
    let matched = null;
    if (incoming.id && existingById.has(incoming.id)) {
      const candidate = existingById.get(incoming.id);
      if (!matchedExistingIds.has(candidate.id)) {
        matched = candidate;
      }
    }

    if (!matched) {
      const targetName = incoming.name.trim().toLowerCase();
      matched = existingGroups.find(
        (candidate) =>
          !matchedExistingIds.has(candidate.id) &&
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

  const toDelete = existingGroups.filter((g) => !matchedExistingIds.has(g.id));
  const blockedDeletes = toDelete.filter(
    (g) => (g._count?.registrations || 0) > 0
  );
  if (blockedDeletes.length > 0) {
    const details = blockedDeletes
      .map(
        (g) =>
          `"${g.name}" (${g._count.registrations} registration${
            g._count.registrations === 1 ? '' : 's'
          })`
      )
      .join(', ');
    throw new HttpError(
      400,
      `Cannot remove ${
        blockedDeletes.length === 1 ? 'group' : 'groups'
      } with existing registrations: ${details}.`
    );
  }

  if (toDelete.length > 0) {
    await tx.categoryGroup.deleteMany({
      where: {
        categoryId,
        id: { in: toDelete.map((g) => g.id) },
      },
    });
  }

  for (const { existing, incoming } of matchedPairs) {
    const hasChanges =
      existing.name !== incoming.name ||
      existing.sortOrder !== incoming.sortOrder;
    if (hasChanges) {
      await tx.categoryGroup.update({
        where: { id: existing.id },
        data: {
          name: incoming.name,
          sortOrder: incoming.sortOrder,
        },
      });
    }
  }

  for (const createData of toCreate) {
    await tx.categoryGroup.create({
      data: {
        categoryId,
        name: createData.name,
        sortOrder: createData.sortOrder,
      },
    });
  }
}

async function syncCompetitionCategories(tx, competitionId, incomingCategories) {
  const existingCategories = await tx.competitionCategory.findMany({
    where: { competitionId },
    include: {
      _count: {
        select: { registrations: true },
      },
      groups: {
        orderBy: { sortOrder: 'asc' },
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

    if (incoming.groups !== undefined) {
      await syncCategoryGroups(tx, existing.id, incoming.groups);
    }
  }

  for (const createData of toCreate) {
    const { groups = [], ...catFields } = createData;
    await tx.competitionCategory.create({
      data: {
        competitionId,
        ...catFields,
        groups:
          groups && groups.length > 0
            ? {
                create: groups.map(({ id: _gId, ...gRest }) => gRest),
              }
            : undefined,
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
        include: ADMIN_COMPETITION_INCLUDE,
      });
    });

    res.status(200).json({
      competition: serializeCompetition(updated),
    });
  } catch (err) {
    next(err);
  }
}

export async function toggleCompetitionCompletion(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.competition.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new HttpError(404, 'Competition not found.');
    }

    const nextCompleted =
      req.body.isCompleted !== undefined
        ? Boolean(req.body.isCompleted)
        : !existing.isCompleted;

    const updated = await prisma.competition.update({
      where: { id: existing.id },
      data: {
        isCompleted: nextCompleted,
        completedAt: nextCompleted ? new Date() : null,
        ...(nextCompleted ? { isPublished: false } : {}),
      },
      include: ADMIN_COMPETITION_INCLUDE,
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

    if (existing.isCompleted) {
      throw new HttpError(
        400,
        'This competition cannot be deleted because it is archived in Competition History. Completed and cancelled competitions must retain their competition and participant records.'
      );
    }

    const regCount = await prisma.registration.count({
      where: { competitionId: existing.id },
    });
    if (regCount > 0) {
      throw new HttpError(
        400,
        `This competition cannot be deleted because participant registrations exist. (${regCount} participant registration record${regCount === 1 ? '' : 's'} found)`
      );
    }

    const previousStoragePath = existing.posterStoragePath;

    const photos = await prisma.competitionPhoto.findMany({
      where: { competitionId: existing.id },
      select: { id: true, photoStoragePath: true },
    });
    // Delete in safe cascade transaction
    await prisma.$transaction(async (tx) => {
      await tx.competitionPhoto.deleteMany({
        where: { competitionId: existing.id },
      });

      const categories = await tx.competitionCategory.findMany({
        where: { competitionId: existing.id },
        select: { id: true },
      });
      const catIds = categories.map((c) => c.id);
      if (catIds.length > 0) {
        await tx.categoryGroup.deleteMany({
          where: { categoryId: { in: catIds } },
        });
        await tx.competitionCategory.deleteMany({
          where: { id: { in: catIds } },
        });
      }

      await tx.competition.delete({
        where: { id: existing.id },
      });
    });

    for (const p of photos) {
      if (p.photoStoragePath) await deleteImageFromBucket(p.photoStoragePath).catch(() => {});
    }

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

    if (nextPublished && existing.isCompleted) {
      throw new HttpError(400, 'Cannot publish a completed competition.');
    }

    const updated = await prisma.competition.update({
      where: { id: existing.id },
      data: {
        isPublished: nextPublished,
        publishedAt: nextPublished ? existing.publishedAt || new Date() : existing.publishedAt,
      },
      include: ADMIN_COMPETITION_INCLUDE,
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

    let updated;
    try {
      updated = await prisma.competition.update({
        where: { id: existing.id },
        data: { posterUrl: publicUrl, posterStoragePath: storagePath },
        include: { categories: { orderBy: { sortOrder: 'asc' } } },
      });
    } catch (error) {
      await deleteImageFromBucket(storagePath).catch(() => {});
      throw error;
    }

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

export async function listCompetitionPhotos(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const competition = await prisma.competition.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!competition) {
      throw new HttpError(404, 'Competition not found.');
    }

    const photos = await prisma.competitionPhoto.findMany({
      where: { competitionId: req.params.id },
      orderBy: { sortOrder: 'asc' },
    });

    res.status(200).json({
      photos: photos.map((p) => ({
        id: p.id,
        competitionId: p.competitionId,
        photoUrl: p.photoUrl,
        caption: p.caption,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt
          ? p.createdAt instanceof Date
            ? p.createdAt.toISOString()
            : String(p.createdAt)
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadCompetitionPhotos(req, res, next) {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      throw new HttpError(400, 'At least one photo file is required.');
    }

    const prisma = getPrismaClient();
    const competition = await prisma.competition.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!competition) {
      throw new HttpError(404, 'Competition not found.');
    }

    const currentCount = await prisma.competitionPhoto.count({
      where: { competitionId: req.params.id },
    });

    const caption =
      typeof req.body?.caption === 'string' ? req.body.caption.trim() : null;

    const createdPhotos = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { publicUrl, storagePath } = await uploadImageToBucket(
        file,
        'event-photos'
      );
      let photo;
      try {
        photo = await prisma.competitionPhoto.create({
          data: {
            competitionId: req.params.id, photoUrl: publicUrl,
            photoStoragePath: storagePath, caption, sortOrder: currentCount + i,
          },
        });
      } catch (error) {
        await deleteImageFromBucket(storagePath).catch(() => {});
        throw error;
      }
      createdPhotos.push(photo);
    }

    const allPhotos = await prisma.competitionPhoto.findMany({
      where: { competitionId: req.params.id },
      orderBy: { sortOrder: 'asc' },
    });

    res.status(201).json({
      message: `${createdPhotos.length} photo(s) uploaded successfully.`,
      created: createdPhotos,
      photos: allPhotos.map((p) => ({
        id: p.id,
        competitionId: p.competitionId,
        photoUrl: p.photoUrl,
        caption: p.caption,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt
          ? p.createdAt instanceof Date
            ? p.createdAt.toISOString()
            : String(p.createdAt)
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCompetitionPhoto(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const photo = await prisma.competitionPhoto.findFirst({
      where: {
        id: req.params.photoId,
        competitionId: req.params.id,
      },
    });

    if (!photo) {
      throw new HttpError(404, 'Photo not found for this competition.');
    }

    await prisma.competitionPhoto.delete({
      where: { id: photo.id },
    });
    if (photo.photoStoragePath) await deleteImageFromBucket(photo.photoStoragePath);

    const remainingPhotos = await prisma.competitionPhoto.findMany({
      where: { competitionId: req.params.id },
      orderBy: { sortOrder: 'asc' },
    });

    res.status(200).json({
      message: 'Photo deleted successfully.',
      photos: remainingPhotos.map((p) => ({
        id: p.id,
        competitionId: p.competitionId,
        photoUrl: p.photoUrl,
        caption: p.caption,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt
          ? p.createdAt instanceof Date
            ? p.createdAt.toISOString()
            : String(p.createdAt)
          : null,
      })),
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

    const { groups = [], ...catData } = normalized;

    const category = await prisma.competitionCategory.create({
      data: {
        ...catData,
        competitionId: competition.id,
        groups:
          groups.length > 0
            ? {
                create: groups.map(({ id: _gId, ...gRest }) => gRest),
              }
            : undefined,
      },
      include: {
        groups: { orderBy: { sortOrder: 'asc' } },
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

    const { groups, ...catData } = normalized;

    const category = await prisma.$transaction(async (tx) => {
      await tx.competitionCategory.update({
        where: { id: existing.id },
        data: catData,
      });

      if (groups !== undefined) {
        await syncCategoryGroups(tx, existing.id, groups);
      }

      return tx.competitionCategory.findUnique({
        where: { id: existing.id },
        include: { groups: { orderBy: { sortOrder: 'asc' } } },
      });
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
      include: {
        _count: {
          select: { registrations: true },
        },
      },
    });

    if (!existing) {
      throw new HttpError(404, 'Category not found.');
    }

    if ((existing._count?.registrations || 0) > 0) {
      throw new HttpError(
        400,
        `Cannot remove category "${existing.name}" with existing registrations (${existing._count.registrations}).`
      );
    }

    await prisma.competitionCategory.delete({
      where: { id: existing.id },
    });

    res.status(200).json({ deleted: true, id: existing.id });
  } catch (err) {
    next(err);
  }
}

export async function addCategoryGroup(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const category = await prisma.competitionCategory.findFirst({
      where: {
        id: req.params.categoryId,
        competitionId: req.params.id,
      },
      include: { groups: true },
    });

    if (!category) {
      throw new HttpError(404, 'Category not found.');
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      throw new HttpError(400, 'Group name is required.');
    }

    const group = await prisma.categoryGroup.create({
      data: {
        categoryId: category.id,
        name,
        sortOrder: category.groups.length + 1,
      },
    });

    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
}

export async function updateCategoryGroup(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.categoryGroup.findFirst({
      where: {
        id: req.params.groupId,
        categoryId: req.params.categoryId,
      },
    });

    if (!existing) {
      throw new HttpError(404, 'Group not found.');
    }

    const name =
      typeof req.body.name === 'string' ? req.body.name.trim() : existing.name;
    if (!name) {
      throw new HttpError(400, 'Group name cannot be empty.');
    }

    const group = await prisma.categoryGroup.update({
      where: { id: existing.id },
      data: {
        name,
        sortOrder: Number.isInteger(req.body.sortOrder)
          ? req.body.sortOrder
          : existing.sortOrder,
      },
    });

    res.status(200).json({ group });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategoryGroup(req, res, next) {
  try {
    const prisma = getPrismaClient();
    const existing = await prisma.categoryGroup.findFirst({
      where: {
        id: req.params.groupId,
        categoryId: req.params.categoryId,
      },
      include: {
        _count: {
          select: { registrations: true },
        },
      },
    });

    if (!existing) {
      throw new HttpError(404, 'Group not found.');
    }

    if ((existing._count?.registrations || 0) > 0) {
      throw new HttpError(
        400,
        `Cannot remove group "${existing.name}" with existing registrations (${existing._count.registrations}).`
      );
    }

    await prisma.categoryGroup.delete({
      where: { id: existing.id },
    });

    res.status(200).json({ deleted: true, id: existing.id });
  } catch (err) {
    next(err);
  }
}
