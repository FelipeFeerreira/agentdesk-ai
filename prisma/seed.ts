/* eslint-disable no-console */
import { PrismaClient } from "@prisma/client";
import { seedDemo } from "../src/lib/seed/demo";

const prisma = new PrismaClient();

seedDemo(prisma)
  .then(() => console.log("Seed complete."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
