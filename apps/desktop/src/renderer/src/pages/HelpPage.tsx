import {
  ArrowRight,
  Blocks,
  CircleHelp,
  FolderOpen,
  Mic2,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";

import {
  APP_DESCRIPTOR,
  APP_NAME,
  APP_TAGLINE,
  APP_VERSION,
} from "@ai-voice-studio/shared-types";
import { Button, GlassCard, StatusBadge } from "@ai-voice-studio/ui";

import { BrandMark } from "../components/BrandMark";
import { PageHeader } from "../components/PageHeader";
import { SectionHeading } from "../components/SectionHeading";
import { desktopApi } from "../lib/desktopApi";

const QUICK_STEPS = [
  {
    icon: Blocks,
    title: "准备一个模型",
    description: "不知道选哪个就下载 VoxCPM2，首次安装会自动完成。",
    action: "去下载模型",
    to: "/models",
  },
  {
    icon: Mic2,
    title: "克隆一个声音",
    description: "导入 3–60 秒清晰人声，并填写录音原文。",
    action: "去克隆声音",
    to: "/voices?clone=1",
  },
  {
    icon: Sparkles,
    title: "输入文字并生成",
    description: "粘贴口播、旁白或台词，试听满意后导出 MP3。",
    action: "开始创作",
    to: "/",
  },
] as const;

const MODEL_CHOICES = [
  {
    badge: "综合最推荐",
    name: "VoxCPM2",
    description: "克隆、情绪和声音设计功能最完整，大多数创作先选它。",
  },
  {
    badge: "方言更多",
    name: "Fun-CosyVoice3",
    description: "提供 19 种中文方言/口音选择，方言内容优先选它。",
  },
  {
    badge: "情绪演绎",
    name: "IndexTTS-2.5",
    description: "情绪与发音控制突出，细腻语气或多语言内容优先选它。",
  },
] as const;

const FAQS = [
  {
    question: "软件打不开，或者窗口一闪就没了？",
    answer:
      "请先完整解压整个分享包，再双击“启动.cmd”。不要单独移动 app 文件夹，也不要直接在压缩包预览里运行；仍打不开时，把整个文件夹移到本机可写的短路径后重试。",
  },
  {
    question: "模型下载失败怎么办？",
    answer:
      "回到“本地引擎”查看磁盘余量和速度，再点击继续或重试。官方源慢时可切换备用源；也可以从其他设备复制完整模型目录后用“离线导入”。已下载部分会保留。",
  },
  {
    question: "几十上百句中途失败，要全部重来吗？",
    answer:
      "不用。字幕配音会逐句缓存，重试只生成未完成或修改过的句子。项目和任务队列会保存在本机，关闭再打开也会继续处理。",
  },
  {
    question: "生成很慢或显存不足怎么办？",
    answer:
      "关闭占用显卡的游戏和视频软件后重试。声作默认一次只加载一个大模型；IndexTTS-2.5 建议 12GB 显存，其余两款建议 8GB 以上。",
  },
  {
    question: "怎么删除模型腾出空间？",
    answer:
      "先退出声作，再打开模型文件夹，删除对应模型的整个文件夹。下次启动会自动识别，需要时还能重新下载。",
  },
  {
    question: "电脑出问题，怎么排查？",
    answer:
      "在“设置”点击“导出诊断包”，把 ZIP 发给负责排查的人。诊断包不包含稿件、录音、生成音频、令牌或完整私人路径。",
  },
] as const;

export const HelpPage = () => (
  <div className="page-content">
    <PageHeader
      title="使用帮助"
      description="第一次使用、模型选择和常见问题，都集中在这里。"
    />

    <section className="help-hero" aria-label={`${APP_NAME} 产品信息`}>
      <BrandMark />
      <div className="min-w-0 flex-1">
        <p>{APP_DESCRIPTOR}</p>
        <h2>{APP_TAGLINE}</h2>
        <span>按需下载模型，打开就能创作。</span>
      </div>
      <StatusBadge tone="success">本地运行</StatusBadge>
    </section>

    <div className="help-grid">
      <GlassCard tone="solid" padding="lg">
        <SectionHeading
          title="三步开始"
          description="按顺序完成一次，以后打开就能直接创作。"
        />
        <ol className="help-steps">
          {QUICK_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.title}>
                <span className="help-steps__number">{index + 1}</span>
                <span className="help-steps__icon">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </span>
                <Link className="help-steps__link" to={step.to}>
                  {step.action}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ol>
      </GlassCard>

      <GlassCard tone="solid" padding="lg">
        <SectionHeading title="模型怎么选" description="三款模型各有长处。" />
        <div className="help-models">
          {MODEL_CHOICES.map((model) => (
            <div key={model.name}>
              <StatusBadge tone="info">{model.badge}</StatusBadge>
              <span>
                <strong>{model.name}</strong>
                <small>{model.description}</small>
              </span>
            </div>
          ))}
        </div>
        <Link className="inline-action-link mt-4" to="/models">
          查看模型大小与电脑要求
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </GlassCard>

      <GlassCard tone="solid" padding="lg">
        <SectionHeading
          title="常见问题"
          description="遇到问题时，先按这里排查。"
        />
        <div className="help-faqs">
          {FAQS.map((item) => (
            <details key={item.question}>
              <summary>
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
                {item.question}
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </GlassCard>
    </div>

    <section className="about-strip" aria-label={`关于${APP_NAME}`}>
      <div className="about-strip__identity">
        <BrandMark compact />
        <span>
          <strong>
            {APP_NAME} <small>v{APP_VERSION}</small>
          </strong>
          <small>{APP_DESCRIPTOR} · Windows 10/11 x64</small>
        </span>
      </div>
      <div className="about-strip__actions">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void desktopApi.app.openModelsFolder()}
        >
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          打开模型文件夹
        </Button>
        <Link className="help-settings-link" to="/settings">
          <Wrench className="h-4 w-4" aria-hidden="true" />
          查看设置
        </Link>
      </div>
    </section>
  </div>
);
