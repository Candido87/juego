# PROGRESS

## Hecho
- [x] Hito 0 — Vista isométrica, lógica pura, cintas, taladros, torre básica, oleadas, tests.

## Hoja de ruta unificada
Dos encargos (A = árbol/torretas/murallas/industria/NPCs, E = electricidad y automatización)
fusionados en un solo orden según sus dependencias. Entre paréntesis, el hito original.

- [x] 1. (A1) Sistema de NPCs y cola de trabajos (construcción por NPC con una sola torreta de balas).
- [ ] 2. (A2) Piezas y recetas nuevas; las construcciones consumen piezas concretas.
- [ ] 3. (A3) Transportistas: reparto de munición y piezas por NPC (modo manual).
- [ ] 4. (E1) Redes eléctricas: generador de combustión, postes y cables, consumo/producción, apagón parcial.
- [ ] 5. (E2) Cintas motorizadas y diferencia entre modo manual (NPC) y automático.
- [ ] 6. (E3) Alimentadores automáticos y torretas con abastecimiento automático.
- [ ] 7. (E4) Baterías, solar y prioridades de consumo.
- [ ] 8. (A4 + E5) Torretas láser (energía) y de fuego (combustible); enemigos que atacan la infraestructura.
- [ ] 9. (A5) Murallas y comportamiento de los enemigos ante ellas.
- [ ] 10. (A6 + E6) Árbol de tecnología con pantalla propia, incluida la rama "Energía y automatización".
- [ ] 11. (A7) Variedad de enemigos y oleadas que exijan mezclar torretas.
- [ ] 12. (E7) Interfaz de red: paneles, indicadores sobre edificios, cables en la vista.
- [ ] 13. (A8 + E8) Equilibrado con `npm run sim` y pulido.

Por qué este orden: el modo manual (transportistas) debe existir antes de que la electricidad lo
automatice; el láser depende de la red; el árbol necesita que existan sus desbloqueos.

Regla: tras cada hito, tests + tipos + build en verde, commit y push a `main`.
