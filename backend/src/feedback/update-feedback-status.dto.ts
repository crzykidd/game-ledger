import { IsEnum } from 'class-validator';
import { FeedbackStatus } from '@game-ledger/contract';

export class UpdateFeedbackStatusDto {
  @IsEnum(FeedbackStatus)
  status!: FeedbackStatus;
}
