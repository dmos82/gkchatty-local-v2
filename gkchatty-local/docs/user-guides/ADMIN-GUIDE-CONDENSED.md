# GKChatty Admin Quick Reference

## Access
Admin Panel → Click "Admin Dashboard" in left sidebar (requires admin role)

![Admin Dashboard](screenshots/05-admin-panel.png)

## User Management
| Action | Steps |
|--------|-------|
| **Create** | Users tab → Create User → Fill username/email/password/role → Create |
| **Edit** | Find user → Edit → Modify → Save |
| **Delete** | Find user → Delete → Confirm (removes all user data permanently) |
| **Reset Password** | Find user → Reset Password → Enter new → User must change on login |
| **Change Role** | Find user → Toggle role badge (user ↔ admin) |

**Roles**: `user` = Chat + upload personal docs | `admin` = Full access + manage system

## System Knowledge Base
| Action | Steps |
|--------|-------|
| **Upload** | System KB tab → Upload → Select PDF/TXT/MD → Wait for indexing |
| **Batch Upload** | Drag multiple files to upload zone |
| **Delete One** | Find doc → Delete → Confirm |
| **Delete All** | Delete All Documents → Type confirmation → Confirm |
| **Re-index** | Re-index All (use if search not working) |

## Tenant Knowledge Base (Team KBs)
| Action | Steps |
|--------|-------|
| **Create** | Tenant KB tab → Create → Name + Description → Create |
| **Add Users** | Select KB → Manage Users → Search → Add |
| **Remove Users** | Select KB → Find user → Remove |
| **Upload Docs** | Select KB → Upload Documents |
| **Delete KB** | Select KB → Delete (removes all docs) |

## Persona Management
| Action | Steps |
|--------|-------|
| **Create** | Personas tab → Create → Name + System Prompt → Save |
| **Set Default** | Find persona → Set as Default |
| **Edit** | Find persona → Edit → Modify prompts → Save |
| **Delete** | Find persona → Delete (cannot delete default) |

**Prompt Examples**:
- Professional: "Be helpful, courteous, cite documentation"
- Technical: "Provide detailed technical explanations with examples"
- Executive: "Provide concise summaries, focus on key takeaways"

## OpenAI Configuration
Settings tab → OpenAI Config:
| Setting | Recommended |
|---------|-------------|
| Primary Model | gpt-4o-mini (fast+quality) or gpt-4o (best quality) |
| Fallback Model | gpt-3.5-turbo |
| Embedding Model | text-embedding-3-small |
| Test Connection | Click to verify API key |

## Usage & Monitoring
| View | Location |
|------|----------|
| System Stats | Stats/Usage tab → Total docs, chats, messages |
| Per-User Usage | Usage tab → Token consumption, costs by user |
| Server Health | Server Info → Uptime, memory, DB status |

## Feedback Management
Feedback tab → View submissions → Delete individual or Delete All

## Maintenance Operations
| Operation | When to Use |
|-----------|-------------|
| Re-index System KB | Search not returning expected results |
| Re-index User Docs | User search inconsistent |
| Fix Metadata (Dry Run) | Preview fixes before applying |
| Fix Metadata (Execute) | Apply vector database fixes |
| Purge Default Namespace | Clean orphaned vectors |
| Pinecone Stats | Monitor vector database health |

## Security Checklist
- [ ] Strong passwords (8+ chars, complexity)
- [ ] Review user list monthly
- [ ] Remove inactive users
- [ ] Only grant admin to those who need it
- [ ] Rotate API keys periodically
- [ ] Avoid uploading docs with PII/secrets
- [ ] Use Tenant KBs for restricted content

## Quick Troubleshooting
| Issue | Fix |
|-------|-----|
| User can't login | Verify account exists, reset password, check active status |
| Docs not in search | Check processing status, re-index, verify search mode |
| AI slow | Check server memory, OpenAI status, consider faster model |
| Upload fails | Check file type, size limits, server disk space |
| Admin panel won't load | Verify admin role, clear cache, check browser console |

## Rate Limits (Production)
| Type | Limit |
|------|-------|
| AI/Chat | 500 req/min |
| Upload | 150 req/5min |
| Auth | 20 req/min |
| Admin | 200 req/15min |

---
*v1.0 | Dec 2024 | Contact tech team for infrastructure issues*
