import { Controller, Get, Patch, Param } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    // TODO
  }

  @Patch(':id')
  update(@Param('id') id: string) {
    // TODO
  }
}
