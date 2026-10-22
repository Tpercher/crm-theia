# Feuille de route

Une PR par étape. L'ordre suit les priorités du cahier des charges : cohérence des données, puis CRM central, Data Lab, permissions, Inbound / Outbound, paramètres, workflows, tracking, enrichissement et IA.

1. **Socle** (cette version) : organisations, comptes, rôles, RLS, contacts, entreprises, historique, audit.
2. **Équipe et accès** : invitations (lien d'invitation, puis email une fois l'emailing en place), changement de rôle, désactivation, rôles personnalisés, équipes.
3. **CRM complet** : leads, opportunités et pipelines, activités, tâches, campagnes, associations, propriétés personnalisées, vues enregistrées et filtres, import / export CSV, fusion de doublons.
4. **Data Lab** : tables façon Clay, colonnes formule / fonction / référence, provenance par cellule, exécutions journalisées, transfert explicite vers le CRM.
5. **Enrichissement** : connexions par organisation (clés chiffrées), file de tâches, crédits et journal par exécution. Adaptateurs :
   - FullEnrich : à écrire d'après sa documentation d'API officielle ;
   - Pipecorn : documentation à obtenir ;
   - scraper Google / Google Maps interne : contrat d'API à définir avec Théo. Le respect des conditions d'utilisation de Google relève de l'exploitant.
6. **Emailing interne** : service d'envoi, domaines d'envoi (SPF, DKIM, DMARC), désinscription, suivi des rebonds, liens avec le consentement des contacts.
7. **Inbound / Outbound, workflows, tracking, IA.**
