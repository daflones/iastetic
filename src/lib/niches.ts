export type NicheId = 'salao' | 'unhas' | 'olhar' | 'barbearia' | 'clinica'

export interface NicheField {
  key: string
  label: string
  placeholder?: string
  type?: 'text' | 'textarea' | 'select' | 'toggle'
  options?: string[]
  hint?: string
}

export interface NicheConfig {
  id: NicheId
  name: string
  short: string
  emoji: string
  tagline: string
  description: string
  professionalLabel: string
  professionalLabelPlural: string
  serviceLabel: string
  clientLabel: string
  starterServices: { name: string; duration_min: number; price: number; category: string }[]
  extraFields: NicheField[]
  toneSuggestions: string[]
  aiNameSuggestions: string[]
  heroWords: string[]
  landingBenefits: { title: string; text: string }[]
  demoScript: { from: 'client' | 'ai'; text: string }[]
}

export const NICHES: Record<NicheId, NicheConfig> = {
  salao: {
    id: 'salao',
    name: 'Salão de Cabelo',
    short: 'Salão',
    emoji: '💇‍♀️',
    tagline: 'Sua agenda cheia enquanto você cuida dos fios.',
    description: 'Cortes, coloração, escova, tratamentos e química. A IA entende tempos de procedimento, encaixes e profissional preferido.',
    professionalLabel: 'Cabeleireiro(a)',
    professionalLabelPlural: 'Cabeleireiros(as)',
    serviceLabel: 'Serviço',
    clientLabel: 'Cliente',
    starterServices: [
      { name: 'Corte feminino', duration_min: 60, price: 90, category: 'Corte' },
      { name: 'Corte masculino', duration_min: 40, price: 50, category: 'Corte' },
      { name: 'Escova', duration_min: 50, price: 70, category: 'Finalização' },
      { name: 'Coloração', duration_min: 120, price: 220, category: 'Química' },
      { name: 'Mechas / Luzes', duration_min: 180, price: 380, category: 'Química' },
      { name: 'Hidratação', duration_min: 45, price: 80, category: 'Tratamento' },
      { name: 'Progressiva', duration_min: 150, price: 300, category: 'Química' },
    ],
    extraFields: [
      { key: 'brands', label: 'Marcas / produtos que utiliza', placeholder: 'Wella, L’Oréal, Kérastase…', hint: 'A IA pode citar quando o cliente perguntar.' },
      { key: 'chemical_policy', label: 'Política para química', type: 'textarea', placeholder: 'Ex.: avaliação prévia obrigatória para mechas; não realizamos química em cabelo com henna.' },
      { key: 'kids', label: 'Atende crianças?', type: 'select', options: ['Sim', 'Não', 'A partir de 6 anos'] },
    ],
    toneSuggestions: ['Acolhedora e descontraída', 'Elegante e profissional', 'Animada e jovem'],
    aiNameSuggestions: ['Bia', 'Lara', 'Helena', 'Manu'],
    heroWords: ['corte', 'coloração', 'escova', 'mechas'],
    landingBenefits: [
      { title: 'Encaixe inteligente', text: 'A IA entende duração de química, corte e escova e encaixa no horário certo do profissional.' },
      { title: 'Retorno de coloração', text: 'Follow-ups automáticos lembrando a cliente do retoque de raiz no tempo ideal.' },
      { title: 'Orçamentos por foto', text: 'Cliente manda a foto do cabelo e a IA orienta o procedimento e o valor estimado.' },
    ],
    demoScript: [
      { from: 'client', text: 'Oi! Quero fazer luzes, quanto fica?' },
      { from: 'ai', text: 'Oi! 💛 Luzes aqui começam em R$ 380 e levam cerca de 3h. Quer que eu veja um horário essa semana?' },
    ],
  },
  unhas: {
    id: 'unhas',
    name: 'Manicure & Pedicure',
    short: 'Unhas',
    emoji: '💅',
    tagline: 'Agenda lotada e clientes fiéis, sem parar o esmalte.',
    description: 'Esmaltação, gel, alongamento, spa dos pés e nail art. A IA agenda, confirma e lembra da manutenção.',
    professionalLabel: 'Nail designer',
    professionalLabelPlural: 'Nail designers',
    serviceLabel: 'Serviço',
    clientLabel: 'Cliente',
    starterServices: [
      { name: 'Manicure tradicional', duration_min: 45, price: 40, category: 'Mãos' },
      { name: 'Pedicure tradicional', duration_min: 50, price: 45, category: 'Pés' },
      { name: 'Mão + pé', duration_min: 90, price: 80, category: 'Combo' },
      { name: 'Esmaltação em gel', duration_min: 60, price: 70, category: 'Gel' },
      { name: 'Alongamento em fibra', duration_min: 150, price: 180, category: 'Alongamento' },
      { name: 'Manutenção de alongamento', duration_min: 90, price: 110, category: 'Alongamento' },
      { name: 'Spa dos pés', duration_min: 60, price: 90, category: 'Pés' },
    ],
    extraFields: [
      { key: 'techniques', label: 'Técnicas que oferece', placeholder: 'Fibra de vidro, gel na tips, banho de gel, blindagem…' },
      { key: 'maintenance_days', label: 'Intervalo de manutenção (dias)', placeholder: '21', hint: 'Usado nos follow-ups de retorno.' },
      { key: 'nail_art', label: 'Faz nail art / decoração?', type: 'select', options: ['Sim', 'Não', 'Somente simples'] },
    ],
    toneSuggestions: ['Carinhosa e próxima', 'Divertida e cheia de emoji', 'Direta e eficiente'],
    aiNameSuggestions: ['Nina', 'Lu', 'Dani', 'Mel'],
    heroWords: ['gel', 'alongamento', 'nail art', 'spa dos pés'],
    landingBenefits: [
      { title: 'Manutenção no prazo', text: 'A IA avisa a cliente quando chega a hora da manutenção do alongamento e já oferece horários.' },
      { title: 'Zero no-show', text: 'Confirmação automática 24h antes com opção de remarcar em um toque.' },
      { title: 'Inspirações por imagem', text: 'Cliente manda a referência de nail art e a IA já informa valor e tempo.' },
    ],
    demoScript: [
      { from: 'client', text: 'Oi, tem horário pra alongamento sábado?' },
      { from: 'ai', text: 'Oi, linda! 💅 Sábado tenho 9h e 14h para alongamento em fibra (R$ 180, ~2h30). Qual prefere?' },
    ],
  },
  olhar: {
    id: 'olhar',
    name: 'Sobrancelha & Cílios',
    short: 'Olhar',
    emoji: '👁️',
    tagline: 'Design perfeito, agenda organizada, cliente encantada.',
    description: 'Design, henna, micropigmentação, extensão e lifting de cílios. A IA cuida de dúvidas, cuidados pós e retornos.',
    professionalLabel: 'Designer de olhar',
    professionalLabelPlural: 'Designers de olhar',
    serviceLabel: 'Procedimento',
    clientLabel: 'Cliente',
    starterServices: [
      { name: 'Design de sobrancelha', duration_min: 30, price: 45, category: 'Sobrancelha' },
      { name: 'Design com henna', duration_min: 45, price: 65, category: 'Sobrancelha' },
      { name: 'Brow lamination', duration_min: 60, price: 150, category: 'Sobrancelha' },
      { name: 'Micropigmentação', duration_min: 150, price: 600, category: 'Sobrancelha' },
      { name: 'Extensão de cílios clássico', duration_min: 120, price: 180, category: 'Cílios' },
      { name: 'Extensão volume russo', duration_min: 150, price: 250, category: 'Cílios' },
      { name: 'Lash lifting', duration_min: 60, price: 130, category: 'Cílios' },
      { name: 'Manutenção de cílios', duration_min: 75, price: 120, category: 'Cílios' },
    ],
    extraFields: [
      { key: 'aftercare', label: 'Cuidados pós-procedimento', type: 'textarea', placeholder: 'Ex.: não molhar por 24h, evitar maquiagem na região…', hint: 'A IA envia ao cliente após o atendimento.' },
      { key: 'contraindications', label: 'Contraindicações', type: 'textarea', placeholder: 'Gestantes, alergia a henna, conjuntivite…' },
      { key: 'maintenance_days', label: 'Intervalo de manutenção de cílios (dias)', placeholder: '15' },
    ],
    toneSuggestions: ['Sofisticada e delicada', 'Acolhedora e informativa', 'Moderna e objetiva'],
    aiNameSuggestions: ['Íris', 'Sofia', 'Clara', 'Aline'],
    heroWords: ['design', 'henna', 'extensão', 'lash lifting'],
    landingBenefits: [
      { title: 'Pós-procedimento automático', text: 'Depois do atendimento, a IA envia os cuidados e responde dúvidas 24h.' },
      { title: 'Retorno de manutenção', text: 'Cílios pedem manutenção a cada 15-20 dias. A IA lembra e agenda sozinha.' },
      { title: 'Triagem de contraindicações', text: 'Antes de agendar micro ou henna, a IA pergunta o essencial e orienta.' },
    ],
    demoScript: [
      { from: 'client', text: 'Boa tarde, faz micropigmentação? Tenho medo de ficar escuro' },
      { from: 'ai', text: 'Boa tarde! ✨ Fazemos sim, com técnica fio a fio bem natural. Posso te mostrar resultados e já ver uma avaliação gratuita?' },
    ],
  },
  barbearia: {
    id: 'barbearia',
    name: 'Barbearia',
    short: 'Barbearia',
    emoji: '💈',
    tagline: 'Cadeira cheia, zero telefone tocando.',
    description: 'Cortes, barba, degradê e grooming. A IA encaixa cliente no horário do barbeiro certo e chama de volta na manutenção.',
    professionalLabel: 'Barbeiro',
    professionalLabelPlural: 'Barbeiros',
    serviceLabel: 'Serviço',
    clientLabel: 'Cliente',
    starterServices: [
      { name: 'Corte masculino', duration_min: 40, price: 50, category: 'Cabelo' },
      { name: 'Corte + barba', duration_min: 60, price: 80, category: 'Combo' },
      { name: 'Barba completa (toalha quente)', duration_min: 35, price: 45, category: 'Barba' },
      { name: 'Degradê / fade', duration_min: 45, price: 60, category: 'Cabelo' },
      { name: 'Pigmentação de barba', duration_min: 25, price: 35, category: 'Barba' },
      { name: 'Sobrancelha na navalha', duration_min: 15, price: 20, category: 'Extras' },
    ],
    extraFields: [
      { key: 'estilo', label: 'Estilo da casa', placeholder: 'Ex.: clássica, moderna, urbana, vintage…', hint: 'A IA usa no tom das respostas e nas artes.' },
      { key: 'diferenciais', label: 'Diferenciais da barbearia', type: 'textarea', placeholder: 'Ex.: cerveja cortesia, sinuca, flanela quente, massagem na barba…' },
      { key: 'produtos', label: 'Produtos à venda', placeholder: 'Ex.: pomada, balm, shampoo — a IA pode oferecer no atendimento.' },
      { key: 'maintenance_days', label: 'Intervalo médio entre cortes (dias)', placeholder: '15' },
    ],
    toneSuggestions: ['Descolada e parceira', 'Clássica e cortês', 'Objetiva e despojada'],
    aiNameSuggestions: ['Duca', 'Marco', 'Vic', 'Theo'],
    heroWords: ['degradê', 'barba', 'navalha', 'toalha quente'],
    landingBenefits: [
      { title: 'Manutenção no automático', text: 'Corte dura 2-3 semanas — a IA chama o cliente pra remarcar antes dele esquecer e ir em outro lugar.' },
      { title: 'Agenda dos barbeiros cheia', text: 'Encaixe inteligente por barbeiro, confirmação automática e lista de espera quando cancela.' },
      { title: 'Fidelidade que vira receita', text: 'Follow-up de aniversário, promoção em dia fraco e cobrança de sinal pelo próprio chat.' },
    ],
    demoScript: [
      { from: 'client', text: 'quanto tá o corte + barba?' },
      { from: 'ai', text: 'Corte + barba sai R$ 80 e leva 1h 💈 Com o Léo tenho hoje 16h e 17h30. Vai de qual?' },
    ],
  },
  clinica: {
    id: 'clinica',
    name: 'Clínica de Estética',
    short: 'Clínica',
    emoji: '✨',
    tagline: 'Avaliações, protocolos e retornos sem esforço.',
    description: 'Limpeza de pele, peelings, corporal e estética avançada. A IA agenda avaliações, explica procedimentos com cuidado e acompanha o pós-sessão.',
    professionalLabel: 'Especialista',
    professionalLabelPlural: 'Especialistas',
    serviceLabel: 'Procedimento',
    clientLabel: 'Cliente',
    starterServices: [
      { name: 'Avaliação estética', duration_min: 30, price: 0, category: 'Avaliação' },
      { name: 'Limpeza de pele profunda', duration_min: 60, price: 180, category: 'Facial' },
      { name: 'Peeling de diamante', duration_min: 50, price: 220, category: 'Facial' },
      { name: 'Massagem relaxante', duration_min: 60, price: 150, category: 'Corporal' },
      { name: 'Drenagem linfática', duration_min: 60, price: 160, category: 'Corporal' },
      { name: 'Depilação a laser (sessão)', duration_min: 40, price: 250, category: 'Depilação' },
    ],
    extraFields: [
      { key: 'especialidades', label: 'Especialidades da clínica', placeholder: 'Ex.: facial, corporal, injetáveis, depilação a laser…', hint: 'A IA só oferece o que está aqui e no catálogo.' },
      { key: 'avaliacao', label: 'Política de avaliação', type: 'textarea', placeholder: 'Ex.: avaliação gratuita obrigatória antes de injetáveis e laser.' },
      { key: 'contraindications', label: 'Contraindicações gerais', type: 'textarea', placeholder: 'Gestantes, uso de isotretinoína, pele bronzeada para laser…' },
      { key: 'aftercare', label: 'Cuidados pós-sessão padrão', type: 'textarea', placeholder: 'Ex.: protetor solar diário, evitar sol por 48h, não manipular a região…' },
    ],
    toneSuggestions: ['Acolhedora e informativa', 'Sofisticada e clínica', 'Gentil e atenciosa'],
    aiNameSuggestions: ['Íris', 'Luna', 'Clara', 'Sofia'],
    heroWords: ['avaliação', 'limpeza de pele', 'laser', 'protocolos'],
    landingBenefits: [
      { title: 'Avaliação antes de tudo', text: 'A IA agenda a avaliação, explica pré-requisitos e nunca promete resultado — cuidado e segurança primeiro.' },
      { title: 'Pós-sessão acompanhado', text: 'Follow-up de cuidados no dia seguinte e lembrete da próxima sessão do protocolo, sem esforço da equipe.' },
      { title: 'Pacotes que não abandonam', text: 'Cliente com pacote recebe lembrete da sessão seguinte — menos abandono, mais receita recorrente.' },
    ],
    demoScript: [
      { from: 'client', text: 'quanto custa limpeza de pele?' },
      { from: 'ai', text: 'A limpeza de pele profunda sai R$ 180 e dura 1h ✨ Primeira vez aqui? Posso agendar uma avaliação gratuita de 30 min pra montar o protocolo certo pra sua pele.' },
    ],
  },
}

export const NICHE_LIST = Object.values(NICHES)
export const DEFAULT_NICHE: NicheId = 'olhar'
export const isNiche = (v: unknown): v is NicheId => typeof v === 'string' && v in NICHES
export function applyNicheTheme(niche: NicheId | 'estetica') {
  document.documentElement.dataset.niche = niche
}
