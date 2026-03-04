import { PrismaClient, PromptRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const systemPrompt = await prisma.prompt.upsert({
    where: { name: "Stoic Core Guidance" },
    update: {
      role: PromptRole.SYSTEM,
      content:
        "You are a grounded Stoic guide. Offer practical, emotionally calm advice rooted in virtue, discipline, and clear thinking.",
    },
    create: {
      name: "Stoic Core Guidance",
      role: PromptRole.SYSTEM,
      content:
        "You are a grounded Stoic guide. Offer practical, emotionally calm advice rooted in virtue, discipline, and clear thinking.",
    },
  });

  const stylePrompt = await prisma.prompt.upsert({
    where: { name: "Concise Reflective Style" },
    update: {
      role: PromptRole.STYLE,
      content:
        "Use concise paragraphs, ask one clarifying question when useful, and end with one concrete next action.",
    },
    create: {
      name: "Concise Reflective Style",
      role: PromptRole.STYLE,
      content:
        "Use concise paragraphs, ask one clarifying question when useful, and end with one concrete next action.",
    },
  });

  const reframingSkill = await prisma.skill.upsert({
    where: { name: "Cognitive Reframing" },
    update: {
      description: "Reframe emotional reactions into controllable actions.",
      body: "Always distinguish what is in the user's control from what is not, then guide toward deliberate action.",
    },
    create: {
      name: "Cognitive Reframing",
      description: "Reframe emotional reactions into controllable actions.",
      body: "Always distinguish what is in the user's control from what is not, then guide toward deliberate action.",
    },
  });

  const mode = await prisma.interactionMode.upsert({
    where: { slug: "stoic-coach" },
    update: {
      name: "Stoic Coach",
      description: "Structured Stoic counsel with retrieval-backed context.",
      active: true,
      isDefault: true,
    },
    create: {
      name: "Stoic Coach",
      slug: "stoic-coach",
      description: "Structured Stoic counsel with retrieval-backed context.",
      active: true,
      isDefault: true,
    },
  });

  await prisma.interactionMode.updateMany({
    where: { id: { not: mode.id } },
    data: { isDefault: false },
  });

  await prisma.modePrompt.upsert({
    where: {
      modeId_promptId: {
        modeId: mode.id,
        promptId: systemPrompt.id,
      },
    },
    update: { order: 0 },
    create: {
      modeId: mode.id,
      promptId: systemPrompt.id,
      order: 0,
    },
  });

  await prisma.modePrompt.upsert({
    where: {
      modeId_promptId: {
        modeId: mode.id,
        promptId: stylePrompt.id,
      },
    },
    update: { order: 1 },
    create: {
      modeId: mode.id,
      promptId: stylePrompt.id,
      order: 1,
    },
  });

  await prisma.modeSkill.upsert({
    where: {
      modeId_skillId: {
        modeId: mode.id,
        skillId: reframingSkill.id,
      },
    },
    update: { order: 0 },
    create: {
      modeId: mode.id,
      skillId: reframingSkill.id,
      order: 0,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
