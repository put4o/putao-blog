---
title: claude code task模块学习
published: 2026-07-22
pinned: true
description: 学习claude code的task模块的学习笔记
tags:
  - claude_code
  - Agent
category: Agent
draft: false
---
# 背景
引入背景：cc的todo模块，只存在于单次对话，没有进行持久化，会话结束就丢失；处理简单任务时，todo可以胜任，但处理负责任务时，需要多会话、长流程；需要引入系统性的任务管理能力。（harness）

# task的设计
### **Tasks 的三项核心改进**（和todo的区别）

Tasks 采用基于文件的存储方式，任务以 [JSON 文件](https://zhida.zhihu.com/search?content_id=270057915&content_type=Article&match_order=1&q=JSON+%E6%96%87%E4%BB%B6&zhida_source=entity)的形式保存在 `~/.claude/tasks` 目录中。这一设计带来了三点关键变化：

**1. 持久化存储**

任务不再依赖会话内存。即使退出会话，Tasks 依然存在，因为它们本质上是系统中的真实文件。

**2. 依赖关系管理**

Tasks 支持显式的依赖关系定义，使得可以按顺序来处理任务。例如，Task B 需要在 Task A 完成后才能开始，Task C 则依赖 A 和 B。这种结构更贴近真实项目，而不是简单的待办列表。

**3. [多会话协作](https://zhida.zhihu.com/search?content_id=270057915&content_type=Article&match_order=1&q=%E5%A4%9A%E4%BC%9A%E8%AF%9D%E5%8D%8F%E4%BD%9C&zhida_source=entity)**

通过设置 `CLAUDE_CODE_TASK_LIST_ID=name`，多个 Claude Code 会话可以共享同一组任务。当某个会话更新任务状态时，其他会话会同步看到变化。


### **文件存储结构**

Tasks 以文件形式存储在 `~/.claude/tasks` 目录下：

```text
~/.claude/tasks/
└── /
    ├── 1.json
    ├── 2.json
    └── ...
```

每个任务都是一个独立的 JSON 文件，以 UUID 命名的文件夹作为容器。

### **任务 JSON 结构**

每个任务文件包含清晰的元数据：

```text
{
  "id": "1",
  "subject": "Initialize project and install dependencies",
  "description": "Set up project structure, package.json, and install core dependencies (express, dotenv, cors, etc.)",
  "activeForm": "Initializing project",
  "status": "pending",
  "blocks": ["2"],
  "blockedBy": []
}
```

**关键字段说明：**

- **id** — 任务标识符
- **subject** — 任务标题
- **description** — 需要完成的内容
- **activeForm** — 执行中的显示文本
- **status** — `pending`（待处理）、`in_progress`（进行中）、`completed`（已完成）
- **blocks** — 等待此任务完成的其他任务（Task 2 无法开始直到 Task 1 完成）
- **blockedBy** — 此任务依赖的任务（空数组表示可以立即开始）

这套依赖关系是以真实文件的形式存储的，而不是保存在内存或会话中。相比之下，传统的 Todos 在关闭终端或会话时就会消失。

### **任务管理工具**

Claude Code 提供了四个用于任务管理的工具，每个工具对应不同的编排需求。

#### **TaskCreate：创建任务项**

```text
TaskCreate({
  subject: "Implement JWT authentication middleware",
  description: "Add JWT validation to API routes with refresh token support",
  activeForm: "Setting up auth middleware..."
})
```

#### **TaskGet：获取任务详情**

```text
TaskGet({ taskId: "2" })
// 返回：描述、状态、blockedBy、blocks、所有者、时间戳
```

#### **TaskUpdate：更新任务状态与关系**

```text
// 认领任务
TaskUpdate({ taskId: "2", owner: "security-reviewer" })

// 开始工作
TaskUpdate({ taskId: "2", status: "in_progress" })

// 标记完成
TaskUpdate({ taskId: "2", status: "completed" })

// 设置依赖
TaskUpdate({ taskId: "3", addBlockedBy: ["1", "2"] })
```

#### **TaskList：查看任务列表**

```text
#1 [completed] Analyze codebase structure
#2 [in_progress] Review authentication module (owner: security-reviewer)
#3 [pending] Generate summary report [blocked by #2]
```


### 相关操作：
#### create_task: 创建任务

```python
def create_task(subject: str, description: str = "",
                blockedBy: list[str] | None = None) -> Task:
    task = Task(
        id=f"task_{int(time.time())}_{random_hex(4)}",
        subject=subject, description=description,
        status="pending", owner=None,
        blockedBy=blockedBy or [],
    )
    save_task(task)
    return task
```

创建时自动 `save_task` 到 `.tasks/{id}.json`。`blockedBy` 声明依赖，比如 "写 API" 的 `blockedBy` 是 `["task_schema"]`。

#### can_start: 依赖检查

一个任务只能在它的 `blockedBy` **全部 completed** 之后才能开始：

```python
def can_start(task_id: str) -> bool:
    task = load_task(task_id)
    for dep_id in task.blockedBy:
        if not _task_path(dep_id).exists():
            return False  # missing dependency = blocked
        dep = load_task(dep_id)
        if dep.status != "completed":
            return False
    return True
```

`can_start` 是 `claim_task` 的前置检查：`blockedBy` 里有任何一个不是 completed，就不能认领。不存在的依赖视为 blocked，避免引用错误 ID 时崩溃。

#### claim_task: 认领任务

Agent 开始做一个任务时，调用 `claim_task`：设置 `owner`，状态从 `pending` → `in_progress`。`owner` 字段记录谁在做这个任务，多 Agent 场景下防止重复认领：

```python
def claim_task(task_id: str, owner: str = "agent") -> str:
    task = load_task(task_id)
    if task.status != "pending":
        return f"Task {task_id} is {task.status}, cannot claim"
    if not can_start(task_id):
        deps = [d for d in task.blockedBy
                if load_task(d).status != "completed"]
        return f"Blocked by: {deps}"
    task.owner = owner
    task.status = "in_progress"
    save_task(task)
    return f"Claimed {task_id} ({task.subject})"
```

如果任务已被别人认领（`status != "pending"`），或者依赖没完成（`can_start` 返回 False），拒绝认领。

#### complete_task: 完成与解锁

任务做完后，设为 `completed`。同时扫描所有其他任务，找出**刚刚被解锁**的下游任务：

```python
def complete_task(task_id: str) -> str:
    task = load_task(task_id)
    task.status = "completed"
    save_task(task)
    # 找出被解锁的下游任务
    unblocked = [t.subject for t in list_tasks()
                 if t.status == "pending" and t.blockedBy
                 and can_start(t.id)]
    msg = f"Completed {task_id} ({task.subject})"
    if unblocked:
        msg += f"\nUnblocked: {', '.join(unblocked)}"
    return msg
```

完成 "schema" 后，"endpoints" 和 "docs" 的 `can_start` 返回 True，它们可以开始。

##
## get_task: 查看完整细节

`list_tasks` 只显示一行摘要。`get_task` 返回完整的任务 JSON，包括 description 和依赖细节。跨会话恢复时，Agent 需要读取完整描述才能继续工作：

```python
def get_task(task_id: str) -> str:
    task = load_task(task_id)
    return json.dumps(asdict(task), indent=2)
```


# 后台任务
## 背景
如果所有任务都串行执行，会非常浪费时间；一轮对话，可能会产生多个工具调用；我们可以将耗费时间的操作丢到后台去异步执行，执行后返回结果到主会话中，因为llm的调用是loop的形式，后续将这些完成的task通过user message方式注入到后续轮次的主会话的llm调用中。

比如一些install、bash等操作

## 相关操作
* should_run_background
	* 再一系列工具中辨别出那些事需要后台执行的

* start_background_task
	* 分配唯一id，扔到线程中后台执行

* collect_background_results
	* 收集有结果的任务，提供给会话


## 完整流程
```python 
# ============================================================
# 处理 AI 响应中的工具调用（Tool Use）
# ============================================================

# 存储所有工具执行结果的列表
# 每个元素是一个字典，包含工具调用的返回信息
results = []

# 遍历 AI 响应中的每个内容块（content block）
# response.content 可能包含文本、工具调用等多种类型
for block in response.content:
    # --------------------------------------------------------
    # 第一步：过滤非工具调用块
    # --------------------------------------------------------
    # 只处理 tool_use 类型的块，文本或其他类型直接跳过
    # tool_use 表示 AI 决定调用某个工具（如 bash、read_file 等）
    if block.type != "tool_use":
        continue
    
    # --------------------------------------------------------
    # 第二步：判断是否需要在后台执行（异步）
    # --------------------------------------------------------
    # should_run_background 判断逻辑：
    #   1. 优先：用户是否显式指定 run_in_background=True
    #   2. 兜底：命令是否包含慢操作关键词（install/build/test 等）
    if should_run_background(block.name, block.input):
        # ---------- 分支 A：后台执行（异步） ----------
        # 启动后台任务，立即返回任务 ID
        # start_background_task 会：
        #   1. 生成唯一 ID（如 bg_0001）
        #   2. 在全局字典 background_tasks 中注册任务状态
        #   3. 启动守护线程执行实际工具调用
        #   4. 立即返回任务 ID（不等待执行完成）
        bg_id = start_background_task(block)
        
        # 立即返回一个"占位"结果，告知用户任务已在后台启动
        results.append({
            "type": "tool_result",
            "tool_use_id": block.id,          # 关联到具体的工具调用
            "content": f"[Background task {bg_id} started] "
                       f"Result will be available when complete."
        })
    else:
        # ---------- 分支 B：前台执行（同步） ----------
        # 直接执行工具调用，会阻塞直到完成
        # 适用于快速操作（如 ls、git status、read_file 等）
        output = execute_tool(block)
        
        # 返回实际的执行结果
        results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": output                 # 命令的实际输出
        })

# ============================================================
# 构造发送给 AI 的 user 消息（包含工具执行结果）
# ============================================================

# 初始化用户消息内容列表
# 这个消息将包含两部分：
#   1. 后台任务完成的通知（如果有）
#   2. 所有工具的执行结果
user_content = []

# ------------------------------------------------------------
# 第一部分：收集后台任务完成的通知
# ------------------------------------------------------------
# collect_background_results() 会：
#   1. 检查 background_tasks 中已完成的任务
#   2. 从 background_results 中取出输出
#   3. 清理已完成的任务（防止内存泄漏）
#   4. 返回格式化的通知列表
bg_notifications = collect_background_results()

if bg_notifications:
    # 将每条通知作为独立的文本块添加到消息中
    # 例如："✅ Background task bg_0001 completed: npm install finished"
    for notif in bg_notifications:
        user_content.append({"type": "text", "text": notif})

# ------------------------------------------------------------
# 第二部分：添加所有工具的执行结果
# ------------------------------------------------------------
# 将之前收集的所有 tool_result 追加到消息中
# 包括：
#   - 同步执行的实际结果
#   - 异步执行的占位通知
user_content.extend(results)

# ------------------------------------------------------------
# 第三部分：将消息添加到对话历史
# ------------------------------------------------------------
# 将工具结果作为 user 消息发送给 AI
# 这样 AI 就能看到工具执行的结果，并据此生成后续响应
# 
# 关键设计：使用 "user" 角色而不是 "tool" 角色
# 原因：某些 AI 模型（如 Claude）不支持 tool 角色
#       用 user 消息传递工具结果是兼容性更好的做法
messages.append({
    "role": "user", 
    "content": user_content
})
```