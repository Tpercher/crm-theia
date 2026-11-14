# Feuille de route

Version détaillée et questions ouvertes : https://claude.ai/artifact/WxAsq4y4xK4v8Xsta926V4

Le découpage suit le plan fonctionnel de Théo du 14/11/2026. Chaque lot correspond à une ou plusieurs PR, livrées avec leurs tests. Les lots 1 à 3 forment le cœur ; l'ordre des lots 4 à 10 dépendra de la priorité commerciale.

0. **Socle** (fait) : organisations isolées (RLS), comptes, rôles, contacts, entreprises, historique, audit.
1. **Objets et propriétés** :
   - tous les objets : contacts, leads, entreprises, tâches, tickets, appels, réunions, transactions, campagnes, partenaires ;
   - propriétés personnalisées typées, avec des règles (chiffrée, sensible, format) ;
   - associations avec libellés, associations hiérarchiques ;
   - import et export.
2. **Équipe, crédits, connexions** : invitations, rôles personnalisés, équipes, portefeuille de crédits (réservation puis débit, plafonds, journal), coffre de secrets chiffré par organisation.
3. **Moteur de filtres, vues, segments** :
   - vues tableau et pipeline, segments ;
   - opérateurs classiques, logiques, inter-propriétés, sur l'historique, de qualité et fuzzy, et sur le graphe d'associations.
4. **Ventes** : pipelines et automatisation de pipe, objectifs, partenaires, planificateur de réunions, guide conversationnel.
5. **Tables Inbound / Outbound** : tables façon Clay, cascade d'enrichissement (FullEnrich, Pipecorn, scraper Google / Maps interne), nettoyage, détection de changement de poste.
6. **Canevas d'automatisation** :
   - déclencheurs, cron, HTTP, connecteurs, if / switch / boucles, IA ;
   - code JS, Python et SQL en bac à sable isolé.
7. **Marketing et Growth** : campagnes UTM, formulaires, CTA, pages, chatflows, scoring, A/B, modèles de message, emailing interne (service séparé).
8. **Data, tracking, RGPD** : code et URL de suivi, intégrations pubs / GTM, intention d'achat, consentement, cookies, purge.
9. **Reporting** : KPI, rapports personnalisés, entonnoirs, attribution, parcours, reporting financier.
10. **IA avancée** : opérateurs prédictifs, agents, Agent Hub.
