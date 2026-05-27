# Treino de Corrida

Aplicativo web para montar e executar treinos intervalados de corrida. Funciona direto no navegador, sem instalação — basta abrir o `index.html`.

Otimizado para celular. Adapta o layout automaticamente para orientação retrato e paisagem.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Estrutura e marcação |
| `style.css` | Estilos e layout responsivo |
| `app.js` | Toda a lógica do aplicativo |

## Funcionalidades

- **Criar treinos personalizados** com aquecimento, blocos intervalados e desaquecimento
- **Quatro tipos de bloco:** caminhada, trote, corrida e progressivo
- **Ritmo por bloco** (exceto trote, que já é um ritmo em si):
  - Caminhada: leve, moderada
  - Corrida: leve, moderada, forte, muito forte
  - Progressivo: leve→moderada, moderada→forte, forte→muito forte
- **Reordenar blocos** arrastando dentro do editor
- **Temporizador com fases**, contagem regressiva, barra de progresso e alertas sonoros
- **Avisos de transição** com beep 5 segundos antes de cada mudança de fase
- **Pausar e retomar** o treino
- **Tela acesa** durante o treino (Wake Lock API) — evita que o celular bloqueie a tela automaticamente
- **Timer resistente ao bloqueio de tela** — se a tela bloquear mesmo assim, o timer se ajusta ao tempo real ao voltar
- **Exportar e importar** treinos em formato JSON
- Dados salvos localmente no navegador (localStorage)

## Como usar

1. Abra `index.html` no navegador do celular
2. Toque em **Novo treino** para criar ou edite um dos treinos existentes
3. Configure aquecimento, blocos intervalados (tipo, duração e ritmo) e desaquecimento
4. Toque no card do treino para iniciá-lo
5. Deslize o card para a esquerda para ver as opções **Editar** e **Excluir**

## Formato JSON para importação

```json
[
  {
    "id": 1001,
    "name": "Intermediário",
    "warmup": 5,
    "warmupPace": "leve",
    "reps": 8,
    "blocks": [
      { "type": "run", "mins": 3, "pace": "moderada" },
      { "type": "walk", "mins": 1, "pace": "leve" }
    ],
    "cooldown": 5,
    "cooldownPace": "leve"
  },
  {
    "id": 1002,
    "name": "Fartlek",
    "warmup": 5,
    "warmupPace": "leve",
    "reps": 6,
    "blocks": [
      { "type": "progressivo", "mins": 3, "pace": "moderada→forte" },
      { "type": "trote", "mins": 2 },
      { "type": "walk", "mins": 1, "pace": "leve" }
    ],
    "cooldown": 5,
    "cooldownPace": "leve"
  }
]
```

### Campos

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | número | Identificador único (use valores altos para evitar conflito) |
| `name` | string | Nome do treino |
| `warmup` | número | Duração do aquecimento em minutos |
| `warmupPace` | string | Ritmo do aquecimento: `leve` ou `moderada` |
| `reps` | número | Número de repetições do bloco intervalado |
| `blocks` | array | Lista de blocos por repetição (ver abaixo) |
| `cooldown` | número | Duração do desaquecimento em minutos |
| `cooldownPace` | string | Ritmo do desaquecimento: `leve` ou `moderada` |

#### Campos de cada bloco

| Campo | Tipo | Descrição |
|---|---|---|
| `type` | string | `walk`, `trote`, `run` ou `progressivo` |
| `mins` | número | Duração em minutos (aceita decimais, ex: `1.5`) |
| `pace` | string | Ritmo — obrigatório para `walk`, `run` e `progressivo`; omitido em `trote` |

#### Valores válidos de `pace` por tipo

| Tipo | Valores aceitos |
|---|---|
| `walk` | `leve`, `moderada` |
| `run` | `leve`, `moderada`, `forte`, `muito forte` |
| `progressivo` | `leve→moderada`, `moderada→forte`, `forte→muito forte` |
| `trote` | — (sem ritmo) |
