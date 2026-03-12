import { Injectable, HttpStatus, Logger } from '@nestjs/common';
import {
  CreatePillarDto,
  UpdatePillarDto,
  CreateBuildingBlockDto,
  UpdateBuildingBlockDto,
  CreateQuestionDto,
  UpdateQuestionDto,
} from '../dto/oda-structure.dto';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class OdaStructureService {
  private readonly logger = new Logger(OdaStructureService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // STRUCTURE — full tree (public)
  // ─────────────────────────────────────────────────────────────────────────

  async getFullStructure() {
    const pillars = await this.prisma.oDAPillar.findMany({
      orderBy: { order: 'asc' },
      include: {
        buildingBlocks: {
          orderBy: { order: 'asc' },
          include: {
            questions: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    return { status: true, statusCode: HttpStatus.OK, data: pillars };
  }

  async getStructureSummary() {
    const pillars = await this.prisma.oDAPillar.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true,
        name: true,
        order: true,
        _count: {
          select: { buildingBlocks: true },
        },
        buildingBlocks: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            order: true,
            _count: {
              select: { questions: true },
            },
          },
        },
      },
    });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      data: pillars.map((p) => ({
        id: p.id,
        name: p.name,
        order: p.order,
        blocksCount: p._count.buildingBlocks,
        buildingBlocks: p.buildingBlocks.map((bb) => ({
          id: bb.id,
          name: bb.name,
          order: bb.order,
          questionsCount: bb._count.questions,
        })),
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PILLARS
  // ─────────────────────────────────────────────────────────────────────────

  async createPillar(dto: CreatePillarDto) {
    const exists = await this.prisma.oDAPillar.findUnique({
      where: { name: dto.name },
    });
    if (exists) {
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'A pillar with this name already exists.',
      };
    }

    const pillar = await this.prisma.oDAPillar.create({
      data: { name: dto.name, order: dto.order },
      include: { buildingBlocks: true },
    });

    return {
      status: true,
      statusCode: HttpStatus.CREATED,
      message: 'Pillar created.',
      data: pillar,
    };
  }

  async updatePillar(id: string, dto: UpdatePillarDto) {
    const pillar = await this.prisma.oDAPillar.findUnique({ where: { id } });
    if (!pillar) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Pillar not found.',
      };
    }

    if (dto.name && dto.name !== pillar.name) {
      const conflict = await this.prisma.oDAPillar.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (conflict) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'A pillar with this name already exists.',
        };
      }
    }

    const updated = await this.prisma.oDAPillar.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
      include: { buildingBlocks: { orderBy: { order: 'asc' } } },
    });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Pillar updated.',
      data: updated,
    };
  }

  async deletePillar(id: string) {
    const pillar = await this.prisma.oDAPillar.findUnique({
      where: { id },
      include: { buildingBlocks: { select: { id: true } } },
    });
    if (!pillar) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Pillar not found.',
      };
    }
    if (pillar.buildingBlocks.length > 0) {
      return {
        status: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: `Cannot delete a pillar that has building blocks. Remove its ${pillar.buildingBlocks.length} block(s) first.`,
      };
    }

    await this.prisma.oDAPillar.delete({ where: { id } });
    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Pillar deleted.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BUILDING BLOCKS
  // ─────────────────────────────────────────────────────────────────────────

  async createBlock(dto: CreateBuildingBlockDto) {
    const pillar = await this.prisma.oDAPillar.findUnique({
      where: { id: dto.pillarId },
    });
    if (!pillar) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Pillar not found.',
      };
    }

    const exists = await this.prisma.oDABuildingBlock.findUnique({
      where: { name: dto.name },
    });
    if (exists) {
      return {
        status: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'A building block with this name already exists.',
      };
    }

    const block = await this.prisma.oDABuildingBlock.create({
      data: {
        name: dto.name,
        pillarId: dto.pillarId,
        order: dto.order,
        maxScore: dto.maxScore ?? 100,
      },
      include: {
        questions: true,
        pillar: { select: { id: true, name: true } },
      },
    });

    return {
      status: true,
      statusCode: HttpStatus.CREATED,
      message: 'Building block created.',
      data: block,
    };
  }

  async updateBlock(id: string, dto: UpdateBuildingBlockDto) {
    const block = await this.prisma.oDABuildingBlock.findUnique({
      where: { id },
    });
    if (!block) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Building block not found.',
      };
    }

    if (dto.pillarId) {
      const pillar = await this.prisma.oDAPillar.findUnique({
        where: { id: dto.pillarId },
      });
      if (!pillar) {
        return {
          status: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Target pillar not found.',
        };
      }
    }

    if (dto.name && dto.name !== block.name) {
      const conflict = await this.prisma.oDABuildingBlock.findUnique({
        where: { name: dto.name },
      });
      if (conflict) {
        return {
          status: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'A building block with this name already exists.',
        };
      }
    }

    const updated = await this.prisma.oDABuildingBlock.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.pillarId !== undefined && { pillarId: dto.pillarId }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.maxScore !== undefined && { maxScore: dto.maxScore }),
      },
      include: {
        questions: { orderBy: { order: 'asc' } },
        pillar: { select: { id: true, name: true } },
      },
    });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Building block updated.',
      data: updated,
    };
  }

  async deleteBlock(id: string) {
    const block = await this.prisma.oDABuildingBlock.findUnique({
      where: { id },
      include: { questions: { select: { id: true } } },
    });
    if (!block) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Building block not found.',
      };
    }

    // Cascade: delete questions first, then the block
    await this.prisma.$transaction([
      this.prisma.oDAQuestion.deleteMany({ where: { buildingBlockId: id } }),
      this.prisma.oDABuildingBlock.delete({ where: { id } }),
    ]);

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Building block and its questions deleted.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUESTIONS
  // ─────────────────────────────────────────────────────────────────────────

  async createQuestion(dto: CreateQuestionDto) {
    const block = await this.prisma.oDABuildingBlock.findUnique({
      where: { id: dto.buildingBlockId },
    });
    if (!block) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Building block not found.',
      };
    }

    const question = await this.prisma.oDAQuestion.create({
      data: {
        text: dto.text,
        buildingBlockId: dto.buildingBlockId,
        order: dto.order,
      },
    });

    return {
      status: true,
      statusCode: HttpStatus.CREATED,
      message: 'Question created.',
      data: question,
    };
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.oDAQuestion.findUnique({
      where: { id },
    });
    if (!question) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Question not found.',
      };
    }

    const updated = await this.prisma.oDAQuestion.update({
      where: { id },
      data: {
        ...(dto.text !== undefined && { text: dto.text }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
    });

    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Question updated.',
      data: updated,
    };
  }

  async deleteQuestion(id: string) {
    const question = await this.prisma.oDAQuestion.findUnique({
      where: { id },
    });
    if (!question) {
      return {
        status: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Question not found.',
      };
    }

    await this.prisma.oDAQuestion.delete({ where: { id } });
    return {
      status: true,
      statusCode: HttpStatus.OK,
      message: 'Question deleted.',
    };
  }
}
