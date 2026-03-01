import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectService } from './project.service';
import { CreateProjectDto, UpdateProjectDto } from './dto';

@UseGuards(AuthGuard('jwt'))
@Controller('api/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.projectService.findAllByUser(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.projectService.findOne(id, req.user.id);
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateProjectDto) {
    return this.projectService.create(req.user.id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Request() req: any, @Body() dto: UpdateProjectDto) {
    return this.projectService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.projectService.remove(id, req.user.id);
  }
}
