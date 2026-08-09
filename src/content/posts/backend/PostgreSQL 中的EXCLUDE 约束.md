---
title: PostgreSQL 中的EXCLUDE 约束
published: 2026-07-21
pinned: false
description: 项目中场景涉及，软删除后重新插入，使用，PostgreSQL 中的EXCLUDE 约束
tags:
  - 后端
  - SQL
category: 后端
draft: false
---


项目登录可以使用第三方账号进行登录，用第三方账号登录在数据库层面即插入一条新的记录，解绑即delete=1，软删除，当使用其他账号进行绑定的时候，如果直接进行插入，原有的唯一键会阻止插入新的记录，UNIQUE (platform, third_party_user_id, app_name)；

但是如果使用postgreSQL中的exclude约束就可以灵活处理这个问题

```sql
CREATE TABLE user_third_party_registration (

    ...

    deleted SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT uq_user_third_party_active

        EXCLUDE (platform WITH =, third_party_user_id WITH =, app_name WITH =)

        WHERE (deleted = 0)  -- 只对 deleted=0 的行生效

);
```
代表只有当deleted = 0时，唯一约束（platform、third_party_user_id、app_name）才会生效

此时，解绑后插入新的数据，就可以成功插入，deleted=0 的记录始终唯一，deleted=1 的只是暂时被约束忽略，从而实现灵活绑定与解绑