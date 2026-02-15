# SANDNES GARN - SharePoint Navigation Guide

**Company:** Sandnes Garn (Norwegian yarn manufacturer)  
**Site Type:** SharePoint document storage  
**Last Updated:** 2026-02-13

## Access Information

### Primary URL (Root Archive)
```
https://sandnesgarn.sharepoint.com/:f:/s/SandnesGarn/Epxn98W7Lk1LussIYXVmeu0BvGLyiVc-5watfaL4mYjcLg?e=1McFU3
```

### Garn (Yarn) Folder Direct URL
```
https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Forms/AllItems.aspx?id=%2Fsites%2FSandnesGarn%2FForhandler%20Arkiv%2FNettside%20forhandler%20arkiv%2FBildearkiv%20%28picture%20archive%29%2FGarn%20%28yarn%29&viewid=d1205ff3%2Db13c%2D4123%2D85ae%2D2bd185cc0f60&p=true
```

## Site Structure

### Navigation Hierarchy
```
Root
└── Forhandler Arkiv (Dealer Archive)
    └── Nettside forhandler arkiv (Website dealer archive)
        └── Bildearkiv (picture archive) (Picture Archive)
            ├── 2022 og tidligere (2022 and earlier)
            ├── 2023
            ├── 2024
            ├── 2025
            ├── 2026
            ├── Enkeltmønster (Individual patterns)
            ├── Garn (yarn) ← MAIN YARN FOLDER
            ├── Lanseringsmateriell (launch materials) (Launch Materials)
            ├── Samarbeid (Collaboration)
            ├── Sandnes Garn Logo
            ├── Slideshow (mp4 video)
            ├── Temahefter (Theme booklets)
            └── Tilbehør (Accessories)
```

## Garn (Yarn) Product Folders

The "Garn (yarn)" folder contains 30+ yarn product subdirectories:

1. **Alpakka** - Main alpaca yarn line
2. **Alpakka Følgetråd** - Alpaca companion thread
3. **Alpakka Silke** - Alpaca silk blend
4. **Alpakka Ull** - Alpaca wool blend
5. **Atlas** - Atlas yarn line
6. **Atlas PetiteKnit (2114)** - PetiteKnit collaboration
7. **Babyull Lanett** - Baby wool
8. **Ballerina Chunky Mohair** - Chunky mohair
9. **Børstet Alpakka** - Brushed alpaca
10. **Cashmere** - Cashmere yarn
11. **Double Sunday** - Double Sunday line
12. **Double Sunday (PetiteKnit)** - PetiteKnit version
13. **Duo** - Duo yarn
14. **Fritidsgarn** - Leisure yarn
15. **KlompeLOMPE Merinoull** - KlompeLOMPE merino wool
16. **KlompeLOMPE Tynn Merinoull** - KlompeLOMPE thin merino
17. **Kos** - Cozy yarn
18. **Labbegarn** - Lab yarn
19. **Line** - Line yarn
20. **Mandarin Naturell** - Natural mandarin
21. **Mandarin Petit** - Petit mandarin
22. **Merinoull** - Merino wool
23. **Mini Alpakka** - Mini alpaca
24. **Paljettgarn** - Sequin yarn
25. **Peer Gynt** - Peer Gynt line
26. **Peer Gynt (Petiteknit)** - PetiteKnit version
27. **Perfect** - Perfect yarn
28. **POPPY** - Poppy yarn
29. **Primo Tynn Silk Mohair** - Thin silk mohair
30. **Robust** - Robust yarn

## Browser Navigation Rules

### Critical: Always Use openclaw Profile
```javascript
// Step 1: Start browser with correct profile
browser({ action: "start", profile: "openclaw" })

// Step 2: Open URL with profile specified
browser({ 
  action: "open", 
  profile: "openclaw",
  targetUrl: "https://sandnesgarn.sharepoint.com/..." 
})

// Step 3: Every subsequent action must include profile
browser({ 
  action: "snapshot", 
  profile: "openclaw",
  targetId: "...",
  interactive: true
})
```

### Navigation Pattern to Garn Folder
1. Open root URL
2. Take snapshot
3. Click "Garn (yarn)" button (typically ref=e48 from root)
4. Take new snapshot to see product folders
5. Click specific product folder button
6. Re-snapshot after each navigation

### SharePoint UI Characteristics
- **Document library interface** with folders, not traditional web pages
- **Breadcrumb navigation** at top: "Forhandler Arkiv → Nettside forhandler arkiv → Bildearkiv (picture archive) → Garn (yarn)"
- **Table/grid view** with checkboxes for bulk operations
- **Sorting columns**: Type, Name, Modified, Created, Created By
- **Filters available**: Word, Excel, PowerPoint, PDF file types
- **Actions**: Download, Edit in grid view, More, Share

### Important Notes
- **NEVER navigate away** from sandnesgarn.sharepoint.com domain
- All content is in SharePoint document library format
- Folders appear as clickable buttons in the snapshot
- Must re-snapshot after each folder navigation (refs invalidate)
- Language is mixed Norwegian/English

## Common Tasks

### List All Yarn Products
1. Navigate to Garn (yarn) folder
2. Snapshot reveals all product folder buttons
3. Extract folder names from button text

### Access Specific Yarn Product
1. Navigate to Garn (yarn) folder
2. Click the specific product folder button
3. Snapshot to see contents (images, PDFs, etc.)

### Return to Parent Folder
- Click breadcrumb buttons (e.g., "Bildearkiv (picture archive)")
- Or use browser back navigation

## Authentication
- Appears to be authenticated via the SharePoint link with access token
- The `e=` parameter in URL is likely the access token
- No additional login observed during navigation
