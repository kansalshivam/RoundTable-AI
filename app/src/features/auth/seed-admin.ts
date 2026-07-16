import { prisma } from "../../lib/db.js";
import { env } from "../../lib/env.js";
import { createPasswordHash } from "../../lib/auth.js";

export async function seedAdmin() {
  const existing = await prisma.adminProfile.findFirst();
  if (existing) return existing;

  const user = await prisma.user.create({
    data: {
      email: env.SEED_ADMIN_EMAIL,
      name: "TPO Admin",
      emailVerified: true,
      accounts: {
        create: {
          accountId: env.SEED_ADMIN_EMAIL,
          providerId: "credential",
          password: await createPasswordHash(env.SEED_ADMIN_PASSWORD),
        },
      },
      profile: {
        create: {
          full_name: "TPO Admin",
          institution_name: env.INSTITUTION_NAME,
        },
      },
    },
    include: { profile: true },
  });

  return user.profile;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedAdmin()
    .then(() => {
      console.log("Admin seed complete.");
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
