import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';

import {
  CreatePriorityAreaDto,
  UpdatePriorityAreaDto,
  CreateActionPlanDto,
  UpdateActionPlanDto,
  CreateEvaluationDto,
  UpdateEvaluationDto,
  PriorityAreaResponseDto,
  ActionPlanResponseDto,
  EvaluationResponseDto,
} from '../dto/dev-plan.dto';
import { DevPlanService } from '../service/dev-plan.service';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@ApiTags('Dev Planning')
@Controller('dev-plan')
export class DevPlanController {
  constructor(private readonly devPlanService: DevPlanService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIORITY AREAS
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('priorities')
  @ApiOperation({
    summary: 'Add a priority area to my organization dev plan',
    description:
      'Creates a new priority area linked to an ODA pillar, building block, and indicator (question). ' +
      'The pillarId → buildingBlockId → indicatorId chain is validated before saving.',
  })
  @ApiResponse({ status: 201, type: PriorityAreaResponseDto })
  createPriorityArea(
    @CurrentUser() user: any,
    @Body() dto: CreatePriorityAreaDto,
  ) {
    return this.devPlanService.createPriorityArea(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Get('priorities')
  @ApiOperation({
    summary: 'List all priority areas for my organization',
    description:
      'Returns all priority areas ordered by priority level (1 first) then creation date. ' +
      'Each area includes its action plan and evaluation if they exist.',
  })
  @ApiResponse({ status: 200, type: PriorityAreaResponseDto, isArray: true })
  listPriorityAreas(@CurrentUser() user: any) {
    return this.devPlanService.listPriorityAreas(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Get('priorities/:priorityId')
  @ApiOperation({ summary: 'Get a single priority area (full detail)' })
  @ApiParam({ name: 'priorityId', description: 'Priority area UUID' })
  @ApiResponse({ status: 200, type: PriorityAreaResponseDto })
  getPriorityArea(
    @CurrentUser() user: any,
    @Param('priorityId', ParseUUIDPipe) priorityId: string,
  ) {
    return this.devPlanService.getPriorityArea(user.id, priorityId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Patch('priorities/:priorityId')
  @ApiOperation({
    summary: 'Update a priority area',
    description:
      'All fields are optional. If any FK field (pillarId, buildingBlockId, indicatorId) ' +
      'is supplied the full chain is re-validated.',
  })
  @ApiParam({ name: 'priorityId', description: 'Priority area UUID' })
  @ApiResponse({ status: 200, type: PriorityAreaResponseDto })
  updatePriorityArea(
    @CurrentUser() user: any,
    @Param('priorityId', ParseUUIDPipe) priorityId: string,
    @Body() dto: UpdatePriorityAreaDto,
  ) {
    return this.devPlanService.updatePriorityArea(user.id, priorityId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Delete('priorities/:priorityId')
  @ApiOperation({
    summary: 'Delete a priority area',
    description: 'Cascades to its action plan and evaluation.',
  })
  @ApiParam({ name: 'priorityId', description: 'Priority area UUID' })
  deletePriorityArea(
    @CurrentUser() user: any,
    @Param('priorityId', ParseUUIDPipe) priorityId: string,
  ) {
    return this.devPlanService.deletePriorityArea(user.id, priorityId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ACTION PLAN
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('priorities/:priorityId/action-plan')
  @ApiOperation({
    summary: 'Create the action plan for a priority area',
    description:
      'One action plan per priority area. Returns 409 if one already exists.',
  })
  @ApiParam({ name: 'priorityId', description: 'Priority area UUID' })
  @ApiResponse({ status: 201, type: ActionPlanResponseDto })
  createActionPlan(
    @CurrentUser() user: any,
    @Param('priorityId', ParseUUIDPipe) priorityId: string,
    @Body() dto: CreateActionPlanDto,
  ) {
    return this.devPlanService.createActionPlan(user.id, priorityId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Patch('priorities/:priorityId/action-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the action plan for a priority area' })
  @ApiParam({ name: 'priorityId', description: 'Priority area UUID' })
  @ApiResponse({ status: 200, type: ActionPlanResponseDto })
  updateActionPlan(
    @CurrentUser() user: any,
    @Param('priorityId', ParseUUIDPipe) priorityId: string,
    @Body() dto: UpdateActionPlanDto,
  ) {
    return this.devPlanService.updateActionPlan(user.id, priorityId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Delete('priorities/:priorityId/action-plan')
  @ApiOperation({ summary: 'Delete the action plan for a priority area' })
  @ApiParam({ name: 'priorityId', description: 'Priority area UUID' })
  deleteActionPlan(
    @CurrentUser() user: any,
    @Param('priorityId', ParseUUIDPipe) priorityId: string,
  ) {
    return this.devPlanService.deleteActionPlan(user.id, priorityId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EVALUATION
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Post('priorities/:priorityId/evaluation')
  @ApiOperation({
    summary: 'Create the evaluation for a priority area',
    description:
      'One evaluation per priority area. Returns 409 if one already exists.',
  })
  @ApiParam({ name: 'priorityId', description: 'Priority area UUID' })
  @ApiResponse({ status: 201, type: EvaluationResponseDto })
  createEvaluation(
    @CurrentUser() user: any,
    @Param('priorityId', ParseUUIDPipe) priorityId: string,
    @Body() dto: CreateEvaluationDto,
  ) {
    return this.devPlanService.createEvaluation(user.id, priorityId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Patch('priorities/:priorityId/evaluation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the evaluation for a priority area' })
  @ApiParam({ name: 'priorityId', description: 'Priority area UUID' })
  @ApiResponse({ status: 200, type: EvaluationResponseDto })
  updateEvaluation(
    @CurrentUser() user: any,
    @Param('priorityId', ParseUUIDPipe) priorityId: string,
    @Body() dto: UpdateEvaluationDto,
  ) {
    return this.devPlanService.updateEvaluation(user.id, priorityId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.NGO_MEMBER)
  @ApiBearerAuth()
  @Delete('priorities/:priorityId/evaluation')
  @ApiOperation({ summary: 'Delete the evaluation for a priority area' })
  @ApiParam({ name: 'priorityId', description: 'Priority area UUID' })
  deleteEvaluation(
    @CurrentUser() user: any,
    @Param('priorityId', ParseUUIDPipe) priorityId: string,
  ) {
    return this.devPlanService.deleteEvaluation(user.id, priorityId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN
  // ─────────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @Get('org/:orgId')
  @ApiOperation({
    summary: 'Admin: Get full dev plan for any organization by ID',
  })
  @ApiParam({ name: 'orgId', description: 'Organization UUID' })
  @ApiResponse({ status: 200, type: PriorityAreaResponseDto, isArray: true })
  listByOrg(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.devPlanService.listByOrg(orgId);
  }
}
