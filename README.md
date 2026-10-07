# 融合新闻案例使用库

为融合新闻教学案例、来源证据和课程采用关系定义版本化契约，隔离教学视图与治理证据。

## 目录

- `contracts/domain.schema.json`：事件信封、对象类型和事件载荷约定。
- `data/sample.json`：可直接校验的中文联调样例。
- `data/samples.json`：覆盖全部事件类型与聚合类型的联调样例集。
- `src/`：契约校验与命令行入口。
- `tests/`：基础字段、时间版本和事件载荷边界测试。
- `docs/domain.md`：领域对象与事件语义。

## 测试

```bash
npm test
```

## 编译检查

```bash
npm run build
```

## 样例校验

```bash
npm run check:sample
```

命令成功时输出 `valid`；校验失败时逐行输出字段、代码和中文说明，并以非零状态结束。
