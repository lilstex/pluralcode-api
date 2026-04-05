/**
 * src/oda/oda.seed.ts
 *
 * Seeds the 5 ODA pillars and 14 building blocks.
 * Run via: npx ts-node -r tsconfig-paths/register src/oda/oda.seed.ts
 * Or add to your main seeder: import { seedOda } from './oda/oda.seed';
 *
 * Idempotent — safe to re-run. Uses upsert on unique names.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ODA_STRUCTURE = [
  {
    name: 'Leadership',
    order: 1,
    blocks: [
      { name: 'Governance', order: 1, maxScore: 100 },
      { name: 'Management', order: 2, maxScore: 100 },
    ],
  },
  {
    name: 'Direction',
    order: 2,
    blocks: [
      { name: 'Mission, Vision & Values', order: 1, maxScore: 100 },
      { name: 'Strategic Planning', order: 2, maxScore: 100 },
    ],
  },
  {
    name: 'Internal Operations',
    order: 3,
    blocks: [
      { name: 'Finance', order: 1, maxScore: 100 },
      { name: 'Procurement & Infrastructure', order: 2, maxScore: 100 },
      { name: 'Legal, Security & Risk', order: 3, maxScore: 100 },
    ],
  },
  {
    name: 'External Operations',
    order: 4,
    blocks: [
      { name: 'Communication', order: 1, maxScore: 100 },
      { name: 'Resource Mobilization', order: 2, maxScore: 100 },
      { name: 'Partnership & Networking', order: 3, maxScore: 100 },
    ],
  },
  {
    name: 'Programming',
    order: 5,
    blocks: [
      { name: 'Programming', order: 1, maxScore: 100 },
      { name: 'Accountability & Safeguarding', order: 2, maxScore: 100 },
      { name: 'Data Management', order: 3, maxScore: 100 },
      { name: 'MEL', order: 4, maxScore: 100 },
    ],
  },
];

export async function seedOda() {
  console.log('🌱  Seeding ODA pillars and building blocks...');

  for (const pillarData of ODA_STRUCTURE) {
    const pillar = await prisma.oDAPillar.upsert({
      where: { name: pillarData.name },
      update: { order: pillarData.order },
      create: { name: pillarData.name, order: pillarData.order },
    });

    for (const blockData of pillarData.blocks) {
      await prisma.oDABuildingBlock.upsert({
        where: { name: blockData.name },
        update: {
          order: blockData.order,
          pillarId: pillar.id,
          maxScore: blockData.maxScore,
        },
        create: {
          name: blockData.name,
          order: blockData.order,
          maxScore: blockData.maxScore,
          pillarId: pillar.id,
        },
      });
    }

    console.log(`  ✅ ${pillarData.name} (${pillarData.blocks.length} blocks)`);
  }

  console.log('✅  ODA seed complete. 5 pillars, 14 building blocks seeded.');
}

// Run directly
if (require.main === module) {
  seedOda()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
