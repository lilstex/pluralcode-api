import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import {
  CreatePillarDto,
  UpdatePillarDto,
  CreateBuildingBlockDto,
  UpdateBuildingBlockDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  StructureResponseDto,
  StructureActionResponseDto,
} from '../dto/oda-structure.dto';
import {
  SaveBlockResponseDto,
  ListAssessmentsQueryDto,
  AdminListAssessmentsQueryDto,
  AssessmentListResponseDto,
  AssessmentSingleResponseDto,
  AssessmentActionResponseDto,
  ODAStatsResponseDto,
} from '../dto/oda-assessment.dto';

import { OdaStructureService } from '../service/oda-structure.service';
import { OdaAssessmentService } from '../service/oda-assessment.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('ODA Assessment')
@Controller('oda')
export class OdaController {
  constructor(
    private readonly structure: OdaStructureService,
    private readonly assessment: OdaAssessmentService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC — ODA STRUCTURE (read-only)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('structure')
  @ApiOperation({
    summary: 'Get full ODA structure',
    description:
      'Returns all pillars → building blocks → questions (with options). Used to render the assessment form.',
  })
  @ApiResponse({ status: 200, type: StructureResponseDto })
  getStructure() {
    return this.structure.getFullStructure();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — PILLAR MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('admin/pillars')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiOperation({ summary: '[Admin] Create a pillar' })
  @ApiResponse({ status: 201, type: StructureActionResponseDto })
  createPillar(@Body() dto: CreatePillarDto) {
    return this.structure.createPillar(dto);
  }

  @Patch('admin/pillars/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiOperation({ summary: '[Admin] Update a pillar' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: StructureActionResponseDto })
  updatePillar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePillarDto,
  ) {
    return this.structure.updatePillar(id, dto);
  }

  @Delete('admin/pillars/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Admin] Delete a pillar (must have no building blocks)',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: StructureActionResponseDto })
  deletePillar(@Param('id', ParseUUIDPipe) id: string) {
    return this.structure.deletePillar(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — BUILDING BLOCK MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('admin/blocks')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiOperation({ summary: '[Admin] Create a building block under a pillar' })
  @ApiResponse({ status: 201, type: StructureActionResponseDto })
  createBlock(@Body() dto: CreateBuildingBlockDto) {
    return this.structure.createBlock(dto);
  }

  @Patch('admin/blocks/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiOperation({
    summary: '[Admin] Update a building block (including maxScore)',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: StructureActionResponseDto })
  updateBlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBuildingBlockDto,
  ) {
    return this.structure.updateBlock(id, dto);
  }

  @Delete('admin/blocks/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Admin] Delete a building block and all its questions',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: StructureActionResponseDto })
  deleteBlock(@Param('id', ParseUUIDPipe) id: string) {
    return this.structure.deleteBlock(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — QUESTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('admin/blocks/:blockId/questions')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiOperation({
    summary: '[Admin] Add a question to a building block',
    description:
      'Accepts an optional `options` array. Each option must have `text`, `scaleValue` (1-4), and `order`.',
  })
  @ApiParam({ name: 'blockId', type: String })
  @ApiResponse({ status: 201, type: StructureActionResponseDto })
  createQuestion(
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.structure.createQuestion({ ...dto, buildingBlockId: blockId });
  }

  @Patch('admin/questions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN, Role.CONTENT_ADMIN)
  @ApiOperation({
    summary: '[Admin] Update a question',
    description:
      'If `options` is provided, existing options are fully replaced with the new set.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: StructureActionResponseDto })
  updateQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.structure.updateQuestion(id, dto);
  }

  @Delete('admin/questions/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Delete a question (and its options)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: StructureActionResponseDto })
  deleteQuestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.structure.deleteQuestion(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN — ASSESSMENT OVERSIGHT
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('admin/assessments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: '[Admin] List all ODA assessments' })
  @ApiResponse({ status: 200, type: AssessmentListResponseDto })
  adminListAssessments(@Query() query: AdminListAssessmentsQueryDto) {
    return this.assessment.adminListAssessments(query);
  }

  @Get('admin/assessments/stats')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: '[Admin] ODA stats — counts, average scores, block breakdown',
  })
  @ApiResponse({ status: 200, type: ODAStatsResponseDto })
  adminGetStats() {
    return this.assessment.adminGetStats();
  }

  @Get('admin/assessments/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({
    summary: '[Admin] Get any assessment by ID (full detail incl. AI summary)',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: AssessmentSingleResponseDto })
  adminGetAssessment(@Param('id', ParseUUIDPipe) id: string) {
    return this.assessment.adminGetAssessmentById(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NGO — ASSESSMENT FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('assessments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiOperation({
    summary: 'Start a new ODA assessment',
    description:
      'Creates a new assessment with one block response record per building block. Blocked if an IN_PROGRESS assessment already exists for this org.',
  })
  @ApiResponse({ status: 201, type: AssessmentActionResponseDto })
  startAssessment(@CurrentUser() user: any) {
    return this.assessment.startAssessment(user.id);
  }

  @Get('assessments')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiOperation({ summary: "List own org's ODA assessments" })
  @ApiResponse({ status: 200, type: AssessmentListResponseDto })
  listMyAssessments(
    @CurrentUser() user: any,
    @Query() query: ListAssessmentsQueryDto,
  ) {
    return this.assessment.getMyAssessments(user.id, query);
  }

  @Get('assessments/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiOperation({
    summary: 'Get a specific assessment (full detail)',
    description:
      'Includes all block responses, answers, and any available pillar summaries. Overall AI summary shown only when status is COMPLETED.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: AssessmentSingleResponseDto })
  getMyAssessment(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessment.getMyAssessmentById(user.id, id);
  }

  @Get('assessments/:id/pillars/:pillarId/summary')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiOperation({
    summary: 'Get the AI summary for a specific pillar',
    description:
      'Available once all blocks in the pillar have been submitted. Generated automatically — no action required from the user.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Assessment UUID' })
  @ApiParam({ name: 'pillarId', type: String, description: 'Pillar UUID' })
  @ApiResponse({ status: 200, type: AssessmentActionResponseDto })
  getPillarSummary(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pillarId', ParseUUIDPipe) pillarId: string,
  ) {
    return this.assessment.getPillarSummary(user.id, id, pillarId);
  }

  @Patch('assessments/:id/blocks/:blockId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiOperation({
    summary: 'Save answers for a building block (draft)',
    description:
      'Can be called multiple times. Block score is computed immediately. Does NOT submit the block.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Assessment UUID' })
  @ApiParam({
    name: 'blockId',
    type: String,
    description: 'Building block UUID',
  })
  @ApiResponse({ status: 200, type: AssessmentActionResponseDto })
  saveBlockResponse(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
    @Body() dto: SaveBlockResponseDto,
  ) {
    return this.assessment.saveBlockResponse(user.id, id, blockId, dto);
  }

  @Post('assessments/:id/blocks/:blockId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiOperation({
    summary: 'Mark a building block as complete',
    description:
      'All questions must be answered first. A submitted block cannot be edited. When all blocks in a pillar are submitted, a per-pillar AI summary is generated automatically.',
  })
  @ApiParam({ name: 'id', type: String, description: 'Assessment UUID' })
  @ApiParam({
    name: 'blockId',
    type: String,
    description: 'Building block UUID',
  })
  @ApiResponse({ status: 200, type: AssessmentActionResponseDto })
  submitBlock(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('blockId', ParseUUIDPipe) blockId: string,
  ) {
    return this.assessment.submitBlock(user.id, id, blockId);
  }

  @Post('assessments/:id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiOperation({
    summary: 'Submit the full assessment for analysis',
    description:
      'All building blocks must be in SUBMITTED status. Triggers the overall AI scoring engine async — assessment moves to COMPLETED once the overall summary is ready.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: AssessmentActionResponseDto })
  submitAssessment(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessment.submitAssessment(user.id, id);
  }

  @Delete('assessments/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an in-progress assessment',
    description: 'Only IN_PROGRESS assessments can be deleted.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, type: AssessmentActionResponseDto })
  deleteAssessment(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessment.deleteAssessment(user.id, id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NGO + ADMIN — PDF DOWNLOAD
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('assessments/:id/download')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Download AI evaluation report as PDF',
    description:
      "Streams a styled PDF of the AI summary for a COMPLETED assessment. NGO members can only download their own org's assessments. Admins can download any.",
  })
  @ApiParam({ name: 'id', type: String, description: 'Assessment UUID' })
  async downloadAssessmentPdf(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const result = await this.assessment.generatePdfReport(
      user.id,
      user.role,
      id,
    );

    if (!result.status) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="oda-assessment-${id}.pdf"`,
    );
    result.stream.pipe(res);
  }
}
