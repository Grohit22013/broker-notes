import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { TaskBatchResultDto, TaskDto } from "@broker-notes/shared/dto";
import {
  batchTasksSchema,
  createTaskSchema,
  taskFiltersSchema,
  taskIdSchema,
  updateTaskSchema,
  type BatchTasksData,
  type CreateTaskData,
  type TaskFilters,
  type UpdateTaskData,
} from "@broker-notes/shared/tasks/validation";

import { CurrentUser, type SessionUser } from "../auth/auth.guard";
import { ZodBody, ZodPipe } from "../common/zod";
import { SESSION_COOKIE } from "../config";

import { TasksService } from "./tasks.service";

const idPipe = new ZodPipe(taskIdSchema);

@ApiTags("tasks")
@ApiCookieAuth(SESSION_COOKIE)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({
    summary: "List follow-up tasks",
    description:
      "Query: status=open|done|all, assignee=me|unassigned|any|<member id>, " +
      "due=overdue|today|week, note, client, case, q. Open tasks: soonest due first.",
  })
  list(
    @CurrentUser() user: SessionUser,
    @Query(new ZodPipe(taskFiltersSchema)) filters: TaskFilters,
  ): Promise<TaskDto[]> {
    return this.tasks.list(user, filters);
  }

  @Post()
  @ApiOperation({ summary: "Create a task (optionally for a note, client or case)" })
  @ZodBody(createTaskSchema)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(createTaskSchema)) body: CreateTaskData,
  ): Promise<TaskDto> {
    return this.tasks.create(user, body);
  }

  @Post("batch")
  @ApiOperation({ summary: "Create up to 20 tasks from one note (checklist or AI action items)" })
  @ZodBody(batchTasksSchema)
  batch(
    @CurrentUser() user: SessionUser,
    @Body(new ZodPipe(batchTasksSchema)) body: BatchTasksData,
  ): Promise<TaskBatchResultDto> {
    return this.tasks.batch(user, body);
  }

  @Get(":id")
  @ApiOperation({ summary: "One task" })
  get(@CurrentUser() user: SessionUser, @Param("id", idPipe) id: string): Promise<TaskDto> {
    return this.tasks.get(user, id);
  }

  @Patch(":id")
  @ApiOperation({
    summary:
      "Update a task: status (complete, reopen, cancel), title, due date, priority, assignee",
    description: "Only the creator, the assignee or an admin (403 otherwise).",
  })
  @ZodBody(updateTaskSchema)
  update(
    @CurrentUser() user: SessionUser,
    @Param("id", idPipe) id: string,
    @Body(new ZodPipe(updateTaskSchema)) body: UpdateTaskData,
  ): Promise<TaskDto> {
    return this.tasks.update(user, id, body);
  }
}
