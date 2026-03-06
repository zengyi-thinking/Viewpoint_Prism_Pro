import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateSettingsDto } from './dto';
import { SettingsService } from './settings.service';

@UseGuards(JwtAuthGuard)
@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings(@CurrentUser() userId: string) {
    return this.settingsService.getSettings(userId);
  }

  @Get('provider-key-stats')
  getProviderKeyStats() {
    return this.settingsService.getProviderKeyPoolStats();
  }

  @Put()
  updateSettings(
    @CurrentUser() userId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settingsService.updateSettings(userId, dto);
  }
}
