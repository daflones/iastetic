# 🎨 Biblioteca de artes do IAstetic

Esta pasta contém os **prompts** para gerar todas as imagens do projeto.

## Como usar

1. Abra o arquivo `.md` do asset desejado (ex.: `hero-landing.md`).
2. Gere a imagem no Midjourney / DALL-E / Ideogram / Leonardo / Flux com o prompt.
3. Salve o arquivo final em **`public/imagens/<nome>.png`** — o nome do arquivo está indicado no topo de cada prompt (ex.: `hero-landing.png`).
4. O site usa a imagem automaticamente. Se o arquivo não existir, um placeholder em gradiente com as cores do nicho aparece no lugar — então dá pra popular aos poucos.

## Convenções

- **Formato**: PNG com fundo transparente quando o prompt disser "isolated/transparent"; JPG/WebP também funcionam (troque a extensão no código ou renomeie para .png).
- **Resolução**: gere no mínimo no tamanho indicado em cada prompt.
- **Estilo geral**: seguir o "STYLE GUIDE" abaixo para coesão.

## STYLE GUIDE (colar antes de qualquer prompt)

> Premium beauty-tech SaaS aesthetic, soft 3D render style, glassmorphism, soft studio lighting, pastel gradients, clean minimal composition, no text unless specified, high-end Brazilian beauty salon vibe, octane render quality, 8k

## Paleta por nicho (use nos prompts)

- `salao` (salão de beleza): âmbar/dourado #C68B2C, grafite #6E7187, fundo creme #FAF8F4
- `unhas` (manicure): coral #E45454, menta #48BEA0, fundo rosé #FFF9F8
- `olhar` (sobrancelhas/cílios): ameixa #885C90, bronze #CC9C70, fundo lilás #FAF7F9
- `estetica` (padrão/marca): rosa-malva #C265A3, lilás #A27AFF, fundo #FBF8FA
