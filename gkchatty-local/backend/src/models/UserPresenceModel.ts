import mongoose, { Schema, Document, Types } from 'mongoose';

export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline';

export interface IActiveDevice {
  socketId: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  userAgent: string;
  connectedAt: Date;
  lastPingAt: Date;
}

export interface IUserPresence extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  username: string;
  status: PresenceStatus;
  customStatus?: string;
  socketIds: string[];
  lastActiveAt: Date;
  lastSeenAt: Date;
  activeDevices: IActiveDevice[];
  autoAwayEnabled: boolean;
  autoAwayMinutes: number;
  // Do Not Disturb fields
  dndEnabled: boolean;
  dndUntil?: Date;
  dndMessage?: string;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  addSocket(
    socketId: string,
    deviceType?: 'desktop' | 'mobile' | 'tablet',
    userAgent?: string
  ): Promise<void>;
  removeSocket(socketId: string): Promise<void>;
  updateActivity(socketId?: string): Promise<void>;
  checkAutoAway(): Promise<boolean>;
}

const ActiveDeviceSchema = new Schema<IActiveDevice>(
  {
    socketId: { type: String, required: true },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet'],
      default: 'desktop',
    },
    userAgent: { type: String },
    connectedAt: { type: Date, default: Date.now },
    lastPingAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserPresenceSchema = new Schema<IUserPresence>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    username: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['online', 'away', 'busy', 'offline'],
      default: 'offline',
    },
    customStatus: {
      type: String,
      maxlength: 100,
    },
    socketIds: [{ type: String }],
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    activeDevices: [ActiveDeviceSchema],
    autoAwayEnabled: { type: Boolean, default: true },
    autoAwayMinutes: { type: Number, default: 5 },
    // Do Not Disturb fields
    dndEnabled: { type: Boolean, default: false },
    dndUntil: { type: Date },
    dndMessage: { type: String, maxlength: 100 },
  },
  {
    timestamps: true,
  }
);

// Indexes
UserPresenceSchema.index({ status: 1 });
UserPresenceSchema.index({ lastActiveAt: -1 });
UserPresenceSchema.index({ socketIds: 1 });

// TTL for cleanup of stale presence (24 hours of offline = remove)
UserPresenceSchema.index(
  { lastSeenAt: 1 },
  {
    expireAfterSeconds: 86400,
    partialFilterExpression: { status: 'offline' },
  }
);

// Helper method to add a socket connection
UserPresenceSchema.methods.addSocket = async function (
  socketId: string,
  deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop',
  userAgent: string = ''
): Promise<void> {
  if (!this.socketIds.includes(socketId)) {
    this.socketIds.push(socketId);
  }

  const existingDevice = this.activeDevices.find(
    (d: IActiveDevice) => d.socketId === socketId
  );

  if (!existingDevice) {
    this.activeDevices.push({
      socketId,
      deviceType,
      userAgent,
      connectedAt: new Date(),
      lastPingAt: new Date(),
    });
  }

  this.status = 'online';
  this.lastActiveAt = new Date();
  await this.save();
};

// Helper method to remove a socket connection
UserPresenceSchema.methods.removeSocket = async function (
  socketId: string
): Promise<void> {
  this.socketIds = this.socketIds.filter((id: string) => id !== socketId);
  this.activeDevices = this.activeDevices.filter(
    (d: IActiveDevice) => d.socketId !== socketId
  );

  // If no more sockets, mark as offline
  if (this.socketIds.length === 0) {
    this.status = 'offline';
    this.lastSeenAt = new Date();
  }

  await this.save();
};

// Helper method to update activity (heartbeat)
UserPresenceSchema.methods.updateActivity = async function (
  socketId?: string
): Promise<void> {
  this.lastActiveAt = new Date();

  // Reset to online if was away
  if (this.status === 'away') {
    this.status = 'online';
  }

  // Update specific socket's lastPingAt
  if (socketId) {
    const device = this.activeDevices.find(
      (d: IActiveDevice) => d.socketId === socketId
    );
    if (device) {
      device.lastPingAt = new Date();
    }
  }

  await this.save();
};

// Helper method to check for auto-away
UserPresenceSchema.methods.checkAutoAway = async function (): Promise<boolean> {
  if (!this.autoAwayEnabled || this.status !== 'online') {
    return false;
  }

  const awayThreshold = this.autoAwayMinutes * 60 * 1000; // Convert to ms
  const timeSinceActive = Date.now() - this.lastActiveAt.getTime();

  if (timeSinceActive > awayThreshold) {
    this.status = 'away';
    await this.save();
    return true;
  }

  return false;
};

// Static method to find or create presence for a user
UserPresenceSchema.statics.findOrCreatePresence = async function (
  userId: Types.ObjectId,
  username: string
): Promise<IUserPresence> {
  let presence = await this.findOne({ userId });

  if (!presence) {
    presence = new this({
      userId,
      username,
      status: 'offline',
      socketIds: [],
      activeDevices: [],
    });
    await presence.save();
  }

  return presence;
};

// Static method to get presence for multiple users
UserPresenceSchema.statics.getBulkPresence = async function (
  userIds: Types.ObjectId[]
): Promise<Map<string, { status: PresenceStatus; lastSeenAt: Date; customStatus?: string; dndEnabled?: boolean; dndUntil?: Date; dndMessage?: string }>> {
  const presences = await this.find({ userId: { $in: userIds } }).lean();

  const presenceMap = new Map<
    string,
    { status: PresenceStatus; lastSeenAt: Date; customStatus?: string; dndEnabled?: boolean; dndUntil?: Date; dndMessage?: string }
  >();

  presences.forEach((p) => {
    presenceMap.set(p.userId.toString(), {
      status: p.status,
      lastSeenAt: p.lastSeenAt,
      customStatus: p.customStatus,
      dndEnabled: p.dndEnabled,
      dndUntil: p.dndUntil,
      dndMessage: p.dndMessage,
    });
  });

  // Add offline status for users without presence records
  userIds.forEach((id) => {
    if (!presenceMap.has(id.toString())) {
      presenceMap.set(id.toString(), {
        status: 'offline',
        lastSeenAt: new Date(),
        dndEnabled: false,
      });
    }
  });

  return presenceMap;
};

// Ensure proper typing for static methods
export interface IUserPresenceModel extends mongoose.Model<IUserPresence> {
  findOrCreatePresence(
    userId: Types.ObjectId,
    username: string
  ): Promise<IUserPresence>;
  getBulkPresence(
    userIds: Types.ObjectId[]
  ): Promise<Map<string, { status: PresenceStatus; lastSeenAt: Date; customStatus?: string; dndEnabled?: boolean; dndUntil?: Date; dndMessage?: string }>>;
}

export default mongoose.model<IUserPresence, IUserPresenceModel>(
  'UserPresence',
  UserPresenceSchema
);
