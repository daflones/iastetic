import { useState } from 'react'
import { Bookmark, Globe, Heart, MessageCircle, MoreHorizontal, Send, Share2, ThumbsUp } from 'lucide-react'
import clsx from 'clsx'

export type SocialPost = {
  title: string
  caption: string
  hashtags: string
  image_url?: string
  platform?: 'instagram' | 'facebook'
  format?: 'feed' | 'story'
}

interface Props {
  post: SocialPost
  bizName: string
  bizLogo?: string | null
  bizHandle?: string | null
}

function Avatar({ name, logo, ring }: { name: string; logo?: string | null; ring?: boolean }) {
  return (
    <div className={clsx('h-8 w-8 rounded-full grid place-items-center text-[11px] font-bold text-white shrink-0 overflow-hidden',
      ring ? 'ring-2 ring-[#d62976] ring-offset-1' : 'bg-gradient-to-br from-brand-400 to-accent-500')}>
      {logo ? <img src={logo} className="h-full w-full object-cover" /> : (name || 'E')[0].toUpperCase()}
    </div>
  )
}

const rand = (seed: string, min: number, max: number) => {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return min + (h % (max - min + 1))
}

/** Preview realista de como o post sai na rede social (feed IG/FB ou story). */
export default function PostPreview({ post, bizName, bizLogo, bizHandle }: Props) {
  const [net, setNet] = useState<'instagram' | 'facebook'>(post.platform ?? 'instagram')
  const handle = (bizHandle ?? bizName).replace(/^@/, '').toLowerCase().replace(/\s+/g, '') || 'seunegocio'
  const likes = rand(post.title, 18, 210)
  const comments = rand(post.caption, 2, 34)

  return (
    <div className="mt-2 max-w-[320px] w-full">
      {/* seletor de rede */}
      <div className="flex gap-1 mb-1.5">
        {(['instagram', 'facebook'] as const).map(n => (
          <button key={n} onClick={() => setNet(n)}
            className={clsx('text-[10px] rounded-full px-2.5 py-0.5 border transition',
              net === n ? 'bg-ink text-white border-ink' : 'border-line text-ink-muted hover:border-ink-muted')}>
            {n === 'instagram' ? 'Instagram' : 'Facebook'} {post.format === 'story' ? '· story' : ''}
          </button>
        ))}
      </div>

      {post.format === 'story'
        ? (net === 'instagram' ? <IgStory post={post} name={handle} logo={bizLogo} biz={bizName} /> : <FbStory post={post} name={bizName} logo={bizLogo} />)
        : (net === 'instagram' ? <IgPost post={post} handle={handle} logo={bizLogo} likes={likes} comments={comments} /> : <FbPost post={post} name={bizName} logo={bizLogo} likes={likes} comments={comments} />)}
    </div>
  )
}

/* ---------------- Instagram feed ---------------- */
function IgPost({ post, handle, logo, likes, comments }: { post: SocialPost; handle: string; logo?: string | null; likes: number; comments: number }) {
  return (
    <div className="rounded-xl border border-line bg-white text-[#262626] overflow-hidden shadow-sm">
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Avatar name={handle} logo={logo} ring />
        <p className="text-xs font-semibold flex-1">{handle}</p>
        <MoreHorizontal className="h-4 w-4 text-neutral-500" />
      </div>
      {/* arte */}
      {post.image_url
        ? <img src={post.image_url} alt={post.title} className="w-full aspect-square object-cover" />
        : <div className="w-full aspect-square bg-gradient-to-br from-brand-100 to-accent-100 grid place-items-center p-6 text-center"><p className="font-display font-semibold text-brand-700">{post.title}</p></div>}
      {/* ações */}
      <div className="flex items-center gap-3.5 px-3 pt-2.5">
        <Heart className="h-6 w-6 hover:text-neutral-500 cursor-pointer" />
        <MessageCircle className="h-6 w-6 -scale-x-100 hover:text-neutral-500 cursor-pointer" />
        <Send className="h-6 w-6 hover:text-neutral-500 cursor-pointer" />
        <Bookmark className="h-6 w-6 ml-auto hover:text-neutral-500 cursor-pointer" />
      </div>
      <p className="px-3 pt-2 text-xs font-semibold">{likes} curtidas</p>
      {/* legenda */}
      <p className="px-3 pt-1 pb-1 text-xs leading-snug">
        <span className="font-semibold mr-1.5">{handle}</span>
        {post.caption}
      </p>
      {post.hashtags && <p className="px-3 pb-1 text-xs text-[#00376b]">{post.hashtags}</p>}
      <p className="px-3 pb-1.5 text-xs text-neutral-400 cursor-pointer">Ver todos os {comments} comentários</p>
      <p className="px-3 pb-2.5 text-[9px] text-neutral-400 uppercase tracking-wide">agora mesmo</p>
    </div>
  )
}

/* ---------------- Facebook feed ---------------- */
function FbPost({ post, name, logo, likes, comments }: { post: SocialPost; name: string; logo?: string | null; likes: number; comments: number }) {
  return (
    <div className="rounded-xl border border-line bg-white text-[#050505] overflow-hidden shadow-sm">
      {/* header */}
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <Avatar name={name} logo={logo} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold leading-tight truncate">{name}</p>
          <p className="text-[11px] text-neutral-500 flex items-center gap-1">Agora · <Globe className="h-3 w-3" /></p>
        </div>
        <MoreHorizontal className="h-4 w-4 text-neutral-500" />
      </div>
      {/* texto */}
      <p className="px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap">{post.caption}{post.hashtags ? `\n` : ''}<span className="text-[#216fdb]">{post.hashtags}</span></p>
      {/* arte */}
      {post.image_url && <img src={post.image_url} alt={post.title} className="w-full aspect-square object-cover" />}
      {/* reações */}
      <div className="flex items-center gap-1 px-3 py-2 text-[11px] text-neutral-500">
        <span className="flex -space-x-1">
          <span className="h-4 w-4 rounded-full bg-[#1877f2] grid place-items-center ring-1 ring-white"><ThumbsUp className="h-2.5 w-2.5 text-white fill-white" /></span>
          <span className="h-4 w-4 rounded-full bg-[#f33e58] grid place-items-center ring-1 ring-white"><Heart className="h-2.5 w-2.5 text-white fill-white" /></span>
        </span>
        <span>{likes}</span>
        <span className="ml-auto">{comments} comentários · {Math.max(1, Math.round(comments / 3))} compartilhamentos</span>
      </div>
      {/* ações */}
      <div className="mx-3 border-t border-neutral-200 grid grid-cols-3 py-0.5">
        {[[ThumbsUp, 'Curtir'], [MessageCircle, 'Comentar'], [Share2, 'Compartilhar']].map(([I, l]: any) => (
          <button key={l} className="flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-semibold text-neutral-600 hover:bg-neutral-100 transition">
            <I className="h-4 w-4" /> {l}
          </button>
        ))}
      </div>
      <div className="h-1.5" />
    </div>
  )
}

/* ---------------- Instagram story ---------------- */
function IgStory({ post, name, logo, biz }: { post: SocialPost; name: string; logo?: string | null; biz: string }) {
  return (
    <div className="rounded-2xl overflow-hidden relative aspect-[9/16] bg-neutral-900 text-white shadow-lg">
      {post.image_url
        ? <img src={post.image_url} alt={post.title} className="absolute inset-0 h-full w-full object-cover" />
        : <div className="absolute inset-0 bg-gradient-to-br from-brand-500 via-brand-600 to-accent-600" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />
      {/* barras de progresso */}
      <div className="absolute top-2 inset-x-2 flex gap-1">
        <div className="h-0.5 flex-1 rounded bg-white" /><div className="h-0.5 flex-1 rounded bg-white/40" />
      </div>
      {/* header */}
      <div className="absolute top-4 inset-x-2.5 flex items-center gap-2">
        <Avatar name={biz} logo={logo} />
        <p className="text-xs font-semibold drop-shadow">{name} <span className="font-normal text-white/70">· agora</span></p>
        <MoreHorizontal className="h-4 w-4 ml-auto" />
      </div>
      {/* legenda sobre a arte */}
      <div className="absolute bottom-14 inset-x-3">
        <p className="text-[13px] font-medium leading-snug drop-shadow-md whitespace-pre-wrap line-clamp-4">{post.caption}</p>
      </div>
      {/* footer */}
      <div className="absolute bottom-0 inset-x-0 p-2.5 flex items-center gap-2">
        <div className="flex-1 rounded-full border border-white/60 px-3.5 py-2 text-xs text-white/80">Enviar mensagem</div>
        <Heart className="h-6 w-6 shrink-0" />
        <Send className="h-6 w-6 shrink-0" />
      </div>
    </div>
  )
}

/* ---------------- Facebook story ---------------- */
function FbStory({ post, name, logo }: { post: SocialPost; name: string; logo?: string | null }) {
  return (
    <div className="rounded-2xl overflow-hidden relative aspect-[9/16] bg-neutral-900 text-white shadow-lg">
      {post.image_url
        ? <img src={post.image_url} alt={post.title} className="absolute inset-0 h-full w-full object-cover" />
        : <div className="absolute inset-0 bg-gradient-to-br from-[#1877f2] via-[#0d5ecf] to-[#7c3aed]" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />
      <div className="absolute top-2 inset-x-2 flex gap-1"><div className="h-0.5 flex-1 rounded bg-white" /><div className="h-0.5 flex-1 rounded bg-white/40" /></div>
      <div className="absolute top-4 inset-x-2.5 flex items-center gap-2">
        <Avatar name={name} logo={logo} />
        <div className="min-w-0">
          <p className="text-xs font-semibold drop-shadow truncate">{name}</p>
          <p className="text-[10px] text-white/70">Agora</p>
        </div>
      </div>
      <div className="absolute bottom-16 inset-x-3">
        <p className="text-[13px] font-medium leading-snug drop-shadow-md whitespace-pre-wrap line-clamp-4">{post.caption}</p>
      </div>
      <div className="absolute bottom-0 inset-x-0 p-2.5 space-y-2">
        <div className="rounded-full border border-white/60 px-3.5 py-2 text-xs text-white/80">Responder…</div>
        <div className="flex items-center justify-center gap-4 pb-0.5">
          <ThumbsUp className="h-5 w-5" /><Heart className="h-5 w-5" /><Share2 className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
