# -*- coding: utf-8 -*-
"""
课堂练习成绩合并工具
用法：
  python merge_scores.py [学生导出文件所在文件夹]
默认文件夹：本脚本同级的“学生导出成绩”目录。

功能：
  1) 读取该文件夹下所有 *.csv / *.json（学生从独立版“导出本机成绩”得到的文件）
  2) 统一字段：姓名, 班级, 练习(部分), 得分, 满分, 正确率, 提交时间
  3) 输出：
     - 成绩汇总_全部记录.csv   ：每条提交一条记录
     - 成绩总览_按学生.csv     ：按 姓名+班级 聚合，列出每个练习最佳正确率
     - 在控制台打印统计：总人数、总提交数、平均分、及格率、各部分平均正确率
"""
import os
import sys
import csv
import json
import glob

DEFAULT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "学生导出成绩")


def norm_record(name, className, section, score, total, percent, submittedAt):
    try:
        score = int(score)
    except Exception:
        score = 0
    try:
        total = int(total)
    except Exception:
        total = 0
    try:
        percent = float(str(percent).replace("%", "").strip())
    except Exception:
        percent = (round(score / total * 1000) / 10) if total else 0
    return {
        "name": (name or "未填写").strip(),
        "className": (className or "未填写").strip(),
        "section": (section or "未填写").strip(),
        "score": score,
        "total": total,
        "percent": percent,
        "submittedAt": (submittedAt or "").strip(),
    }


def parse_csv(path):
    recs = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows:
        return recs
    # 找表头
    header = rows[0]
    # 兼容中英文/乱序：按列名定位
    def idx(names):
        for n in names:
            for j, h in enumerate(header):
                if n in h:
                    return j
        return -1
    i_name = idx(["姓名", "name"])
    i_cls = idx(["班级", "class", "班级名"])
    i_sec = idx(["练习", "部分", "section", "part"])
    i_score = idx(["得分", "score"])
    i_pct = idx(["正确率", "percent"])
    i_time = idx(["提交时间", "时间", "time", "submitted"])
    for r in rows[1:]:
        if not any(c.strip() for c in r):
            continue
        name = r[i_name] if i_name >= 0 and i_name < len(r) else ""
        cls = r[i_cls] if i_cls >= 0 and i_cls < len(r) else ""
        sec = r[i_sec] if i_sec >= 0 and i_sec < len(r) else ""
        sc = r[i_score] if i_score >= 0 and i_score < len(r) else "0/0"
        pct = r[i_pct] if i_pct >= 0 and i_pct < len(r) else ""
        tm = r[i_time] if i_time >= 0 and i_time < len(r) else ""
        # 得分可能是 "x/y"
        if "/" in str(sc):
            a, b = sc.split("/", 1)
            recs.append(norm_record(name, cls, sec, a, b, pct, tm))
        else:
            recs.append(norm_record(name, cls, sec, sc, 0, pct, tm))
    return recs


def parse_json(path):
    recs = []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    items = data.get("records", []) if isinstance(data, dict) else data
    for it in items:
        recs.append(norm_record(
            it.get("name"), it.get("className"),
            it.get("partName") or it.get("sectionTitle") or it.get("section"),
            it.get("score"), it.get("total"), it.get("percent"),
            it.get("submittedAt"),
        ))
    return recs


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DIR
    if not os.path.isdir(folder):
        print("❌ 文件夹不存在：", folder)
        print("请把学生导出的 csv/json 文件放进该目录，或用参数指定目录。")
        return
    files = sorted(glob.glob(os.path.join(folder, "*.csv")) +
                  glob.glob(os.path.join(folder, "*.json")))
    files = [f for f in files if not os.path.basename(f).startswith("成绩")]
    if not files:
        print("⚠️ 该文件夹下没有找到 csv/json 文件：", folder)
        return

    all_recs = []
    for fp in files:
        try:
            if fp.lower().endswith(".csv"):
                rs = parse_csv(fp)
            else:
                rs = parse_json(fp)
            all_recs.extend(rs)
            print(f"  读取 {os.path.basename(fp)} → {len(rs)} 条")
        except Exception as e:
            print(f"  ⚠️ 跳过 {os.path.basename(fp)}（解析失败：{e}）")

    if not all_recs:
        print("❌ 没有解析出任何成绩记录。")
        return

    # 去重（同一人同一练习同一提交时间视为重复）
    seen = set()
    uniq = []
    for r in all_recs:
        key = (r["name"], r["className"], r["section"], r["submittedAt"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(r)
    all_recs = uniq

    # 输出1：全部记录
    out_all = os.path.join(folder, "成绩汇总_全部记录.csv")
    with open(out_all, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["姓名", "班级", "练习(部分)", "得分", "满分", "正确率(%)", "提交时间"])
        for r in all_recs:
            w.writerow([r["name"], r["className"], r["section"], r["score"],
                        r["total"], r["percent"], r["submittedAt"]])

    # 输出2：按学生总览（每个练习取最佳正确率）
    students = {}
    for r in all_recs:
        k = (r["name"], r["className"])
        st = students.setdefault(k, {})
        st.setdefault("sections", {})
        cur = st["sections"].get(r["section"])
        if cur is None or r["percent"] > cur:
            st["sections"][r["section"]] = r["percent"]

    out_stu = os.path.join(folder, "成绩总览_按学生.csv")
    sections_order = []
    for r in all_recs:
        if r["section"] not in sections_order:
            sections_order.append(r["section"])
    with open(out_stu, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["姓名", "班级", "完成练习数"] + sections_order + ["各练习平均正确率(%)"])
        for (name, cls), st in sorted(students.items(), key=lambda x: (x[0][1], x[0][0])):
            secs = st["sections"]
            row = [name, cls, len(secs)]
            pcts = []
            for s in sections_order:
                v = secs.get(s)
                row.append(v if v is not None else "")
                if v is not None:
                    pcts.append(v)
            avg = round(sum(pcts) / len(pcts), 1) if pcts else 0
            row.append(avg)
            w.writerow(row)

    # 统计
    total_rec = len(all_recs)
    students_n = len(students)
    avg_all = round(sum(r["percent"] for r in all_recs) / total_rec, 1)
    pass_n = sum(1 for r in all_recs if r["percent"] >= 60)
    pass_rate = round(pass_n / total_rec * 100, 1)
    print("\n========== 统计 ==========")
    print(f"学生(姓名+班级)人数：{students_n}")
    print(f"提交记录数：{total_rec}")
    print(f"平均正确率：{avg_all}%")
    print(f"及格率(>=60%)：{pass_rate}%  （{pass_n}/{total_rec}）")
    print("各部分平均正确率：")
    for s in sections_order:
        ps = [r["percent"] for r in all_recs if r["section"] == s]
        if ps:
            print(f"  - {s}：{round(sum(ps)/len(ps),1)}%  （{len(ps)} 次提交）")
    print("\n✅ 已生成：")
    print("  ", out_all)
    print("  ", out_stu)


if __name__ == "__main__":
    main()
