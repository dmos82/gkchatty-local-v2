# GKChatty Administrator Guide

**Version:** 1.0
**Last Updated:** December 2024

---

## Table of Contents

1. [Administrator Overview](#administrator-overview)
2. [Accessing the Admin Panel](#accessing-the-admin-panel)
3. [User Management](#user-management)
4. [System Knowledge Base Management](#system-knowledge-base-management)
5. [Tenant Knowledge Base Management](#tenant-knowledge-base-management)
6. [Persona Management](#persona-management)
7. [OpenAI API Configuration](#openai-api-configuration)
8. [Usage Statistics & Monitoring](#usage-statistics--monitoring)
9. [Feedback Management](#feedback-management)
10. [System Settings](#system-settings)
11. [Maintenance Operations](#maintenance-operations)
12. [Security Best Practices](#security-best-practices)
13. [Troubleshooting](#troubleshooting)

---

## Administrator Overview

As a GKChatty administrator, you have access to:

| Capability | Description |
|------------|-------------|
| **User Management** | Create, edit, and delete user accounts |
| **System KB** | Upload and manage organization-wide documents |
| **Tenant KB** | Create isolated knowledge bases for teams |
| **Personas** | Configure AI behavior profiles |
| **API Settings** | Manage OpenAI integration |
| **Analytics** | View usage statistics and costs |
| **Feedback** | Review and manage user feedback |

---

## Accessing the Admin Panel

### Navigation

1. Log in with your administrator account
2. Click the **Admin** link in the navigation menu
3. The admin dashboard appears with tabbed sections

### Admin Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  GKChatty Admin Panel                                           │
├─────────────────────────────────────────────────────────────────┤
│  [Users] [System KB] [Tenant KB] [Personas] [Settings] [Stats]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Tab Content Appears Here                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Management

### Viewing Users

Navigate to the **Users** tab to see all registered users.

| Column | Description |
|--------|-------------|
| Username | User's login name |
| Email | User's email address |
| Role | `admin` or `user` |
| Status | Active/inactive indicator |
| Actions | Edit, delete, reset password |

### Creating a New User

1. Click **Create User** or **Add User** button
2. Fill in the required fields:
   - **Username**: Unique login identifier
   - **Email**: Valid email address
   - **Password**: Initial password (user will be prompted to change)
   - **Role**: Select `user` or `admin`
3. Click **Create**

> **Tip:** Enable "Force password change on first login" for security.

### Editing a User

1. Find the user in the list
2. Click the **Edit** button
3. Modify user details
4. Click **Save**

### Deleting a User

1. Find the user in the list
2. Click the **Delete** button
3. Confirm the deletion

> **Warning:** Deleting a user removes their chat history and uploaded documents. This action cannot be undone.

### Resetting a User's Password

1. Find the user in the list
2. Click **Reset Password**
3. Enter the new password
4. The user will be prompted to change it on next login

### Changing User Roles

1. Find the user in the list
2. Click the role badge or edit button
3. Toggle between `user` and `admin`
4. Save changes

**Role Capabilities:**

| Action | User | Admin |
|--------|------|-------|
| Chat with AI | Yes | Yes |
| Upload personal documents | Yes | Yes |
| Browse System KB | Yes | Yes |
| Access Admin Panel | No | Yes |
| Manage other users | No | Yes |
| Upload to System KB | No | Yes |

---

## System Knowledge Base Management

The System KB contains documents accessible to all users.

### Accessing System KB Management

1. Navigate to **Admin Panel**
2. Click the **System KB** tab

### Uploading Documents

1. Click **Upload Document** or drag files to the upload zone
2. Select one or more files:
   - **PDF** (`.pdf`) - Recommended for formatted documents
   - **Text** (`.txt`) - Plain text files
   - **Markdown** (`.md`) - Formatted text with headers/lists
3. Wait for processing to complete
4. Documents are automatically indexed for search

**Batch Upload:**
- Select multiple files at once
- Progress indicators show each file's status
- Failed uploads are highlighted with errors

### Viewing Documents

The document list shows:
- **Filename**: Original document name
- **Upload Date**: When the document was added
- **Size**: File size in KB/MB
- **Status**: Processing status (indexed, pending, error)

### Deleting Documents

**Individual Delete:**
1. Find the document in the list
2. Click the **Delete** button
3. Confirm deletion

**Delete All:**
1. Click **Delete All Documents**
2. Type confirmation text if required
3. Confirm the action

> **Warning:** Deleted documents are removed from search results immediately.

### Organizing with Folders

1. Create folders to organize documents by category
2. Move documents between folders
3. Set folder-level permissions if needed

### Re-indexing Documents

If search results seem incomplete:

1. Navigate to System KB management
2. Click **Re-index All** or select specific documents
3. Wait for indexing to complete
4. Verify search functionality

---

## Tenant Knowledge Base Management

Tenant KBs provide isolated document collections for specific teams or departments.

### Creating a Tenant KB

1. Navigate to **Tenant KB** tab
2. Click **Create Tenant KB**
3. Enter:
   - **Name**: Descriptive name (e.g., "Sales Team KB")
   - **Description**: Purpose of this KB
4. Click **Create**

### Managing Tenant KB Access

**Add Users:**
1. Select the Tenant KB
2. Click **Manage Users** or **Add Users**
3. Search for users by name
4. Select users to add
5. Save changes

**Remove Users:**
1. Select the Tenant KB
2. Find the user in the members list
3. Click **Remove**
4. Confirm removal

### Uploading to Tenant KB

1. Select the Tenant KB
2. Click **Upload Documents**
3. Select files to upload
4. Documents are only searchable by KB members

### Deleting a Tenant KB

1. Select the Tenant KB
2. Click **Delete**
3. Confirm deletion

> **Warning:** All documents in the Tenant KB will be deleted.

---

## Persona Management

Personas customize AI behavior for different use cases.

### Viewing Personas

Navigate to the **Personas** tab to see all configured personas.

| Field | Description |
|-------|-------------|
| Name | Display name for the persona |
| System Prompt | Instructions for AI behavior |
| Default | Whether this is the default persona |
| Status | Active/inactive |

### Creating a Persona

1. Click **Create Persona**
2. Enter:
   - **Name**: User-facing persona name (e.g., "Technical Support")
   - **System Prompt**: Instructions for the AI (see examples below)
   - **Set as Default**: Check to make this the default persona
3. Click **Save**

**Example System Prompts:**

```
# Professional Support Persona
You are a professional customer support representative.
Be helpful, courteous, and provide clear answers.
Always cite relevant documentation when available.
```

```
# Technical Expert Persona
You are a technical expert assistant.
Provide detailed technical explanations with examples.
Use appropriate technical terminology.
Reference specific documentation sections when applicable.
```

```
# Executive Summary Persona
You are an executive assistant.
Provide concise, high-level summaries.
Focus on key takeaways and action items.
Avoid technical jargon unless necessary.
```

### Editing a Persona

1. Find the persona in the list
2. Click **Edit**
3. Modify the name or prompts
4. Save changes

### Setting the Default Persona

1. Find the persona to set as default
2. Click **Set as Default** or toggle the default switch
3. The previous default is automatically unset

### Deleting a Persona

1. Find the persona in the list
2. Click **Delete**
3. Confirm deletion

> **Note:** You cannot delete the default persona. Set a different default first.

---

## OpenAI API Configuration

Configure the AI models used by GKChatty.

### Accessing API Settings

1. Navigate to **Admin Panel**
2. Click **Settings** or **OpenAI Config** tab

### Configuring Models

| Setting | Description | Recommended Value |
|---------|-------------|-------------------|
| **Primary Chat Model** | Main model for responses | `gpt-4o` or `gpt-4o-mini` |
| **Fallback Model** | Backup if primary fails | `gpt-3.5-turbo` |
| **Embedding Model** | For document search | `text-embedding-3-small` |

### Testing API Connection

1. Enter or update the API key
2. Click **Test Connection**
3. Verify success message
4. Save configuration

### Model Selection Guide

| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| `gpt-4o` | Medium | Highest | $$$ |
| `gpt-4o-mini` | Fast | High | $$ |
| `gpt-3.5-turbo` | Fastest | Good | $ |

---

## Usage Statistics & Monitoring

### Accessing Usage Dashboard

Navigate to **Usage** or **Stats** tab.

### Available Metrics

**System-Wide:**
- Total documents (System KB + User docs)
- Total chat sessions
- Total messages sent
- Active users

**Per-User:**
- Token consumption (prompt + completion)
- Estimated cost
- Document count
- Chat count

**Time-Based:**
- Monthly usage markers
- Usage trends

### Server Information

The admin panel displays:

| Metric | Description |
|--------|-------------|
| **Uptime** | How long the server has been running |
| **Memory Usage** | RAM consumption (RSS, Heap) |
| **Node Version** | Runtime version |
| **MongoDB Status** | Database connection health |

### Exporting Usage Data

If available:
1. Navigate to Usage tab
2. Select date range
3. Click **Export** (CSV/JSON)

---

## Feedback Management

### Viewing Feedback

1. Navigate to **Feedback** tab
2. Browse submitted feedback

Each entry shows:
- User who submitted
- Timestamp
- Feedback content
- Associated chat (if applicable)

### Managing Feedback

**Delete Individual:**
1. Find the feedback entry
2. Click **Delete**
3. Confirm

**Delete All:**
1. Click **Delete All Feedback**
2. Confirm action

---

## System Settings

### Global Configuration

Access system-wide settings to configure:

- Feature flags
- Rate limiting adjustments (contact tech team)
- Default behaviors

### Feature Flags

| Flag | Description |
|------|-------------|
| Allow General Questions | Enable non-RAG queries |
| Show Model Used | Display AI model badge in responses |
| Enable Ollama | Use local models (requires setup) |

---

## Maintenance Operations

### Re-indexing Operations

**Re-index System KB:**
```
Admin Panel → System KB → Re-index All
```
Use when:
- Documents aren't appearing in search
- After major document updates
- To fix corrupted indexes

**Re-index User Documents:**
```
Admin Panel → Settings → Re-index User Docs
```
Use when:
- User search is inconsistent
- After system migration

### Vector Cleanup

**Purge Default Namespace:**
Removes orphaned vectors from the default Pinecone namespace.

**Fix Metadata (Dry Run):**
Preview metadata fixes without applying changes.

**Fix Metadata (Execute):**
Apply metadata fixes to vector database.

### Viewing Pinecone Statistics

Monitor vector database health:
- Total vectors per namespace
- Index utilization
- Namespace breakdown

---

## Security Best Practices

### User Management

1. **Use strong passwords**: Enforce minimum 8 characters with complexity
2. **Regular audits**: Review user list monthly
3. **Remove inactive users**: Delete accounts no longer needed
4. **Principle of least privilege**: Only grant admin to those who need it

### Document Security

1. **Review uploads**: Periodically audit System KB documents
2. **Sensitive data**: Avoid uploading documents with PII/secrets
3. **Access control**: Use Tenant KBs for restricted content

### API Security

1. **Rotate API keys**: Update OpenAI key periodically
2. **Monitor usage**: Watch for unusual token consumption
3. **Rate limits**: Ensure limits are appropriate for user count

### Session Management

1. **Session timeouts**: Users are logged out after inactivity
2. **Secure cookies**: Sessions use HTTP-only cookies
3. **HTTPS**: Ensure all traffic is encrypted

---

## Troubleshooting

### User Can't Log In

1. Verify the account exists in Users tab
2. Reset their password
3. Check if account is active
4. Verify they're using correct credentials

### Documents Not Appearing in Search

1. Check document processing status
2. Verify search mode (System KB vs User Docs)
3. Try re-indexing the document
4. Check Pinecone namespace stats

### AI Responses Are Slow

1. Check server memory usage
2. Verify OpenAI API status
3. Review rate limiting configuration
4. Consider switching to faster model

### Upload Failures

1. Check file type (PDF, TXT, MD only)
2. Verify file size limits
3. Check server disk space
4. Review server logs for errors

### Admin Panel Not Loading

1. Verify you have admin role
2. Clear browser cache
3. Try different browser
4. Check browser console for errors

### API Connection Issues

1. Verify OpenAI API key is valid
2. Check API key has sufficient credits
3. Test connection in settings
4. Review error messages

---

## Quick Reference

### Common Admin Tasks

| Task | Location |
|------|----------|
| Create user | Admin → Users → Create |
| Reset password | Admin → Users → [User] → Reset |
| Upload to System KB | Admin → System KB → Upload |
| Create persona | Admin → Personas → Create |
| View usage | Admin → Usage |
| Check server health | Admin → Server Info |

### Important Limits

| Limit | Value |
|-------|-------|
| File upload max size | Check with tech team |
| Rate limit (AI) | 500 requests/minute |
| Rate limit (Upload) | 150 requests/5 minutes |
| Session timeout | Configured by tech team |

---

## Getting Help

For issues beyond this guide:

1. **Tech Team**: Contact for infrastructure issues
2. **Logs**: Server logs contain detailed error information
3. **Health Check**: Use `/health` endpoint for system status

---

*GKChatty Administrator Guide v1.0 - December 2024*
