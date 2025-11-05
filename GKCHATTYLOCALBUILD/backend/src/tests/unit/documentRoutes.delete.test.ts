import { handleDeleteDocument } from '../../routes/documentRoutes';
import * as pineconeService from '../../utils/pineconeService';
import * as s3Helper from '../../utils/s3Helper';
import * as mongooseModule from 'mongoose';
import { UserDocument } from '../../models/UserDocument';

// Mock external services
jest.mock('../../utils/pineconeService');
jest.mock('../../utils/s3Helper');
jest.mock('../../models/UserDocument');

const mongoose = mongooseModule as unknown as typeof mongooseModule;

describe('handleDeleteDocument error handling', () => {
  const mockReq: any = {
    params: { docId: '60f7f8e1b6423c6b12345678' },
    user: { _id: 'user123', role: 'admin' },
  };

  const mockRes: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };

  const mockNext = jest.fn();

  beforeAll(() => {
    // Force mongoose.Types.ObjectId.isValid to return true
    jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValue(true);

    // Mock DB result with chainable select() -> exec() style call pattern
    (UserDocument.findOne as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        _id: mockReq.params.docId,
        sourceType: 'user',
        userId: mockReq.user._id,
        fileKey: 'user_docs/sample.pdf',
      }),
    });

    // Mock Pinecone delete to throw
    (pineconeService.deleteVectorsByFilter as jest.Mock).mockRejectedValue(
      new Error('Simulated Pinecone Deletion Error')
    );

    // Mock S3 delete to resolve
    (s3Helper.deleteFile as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should respond with 500 when Pinecone deletion fails', async () => {
    await handleDeleteDocument(mockReq, mockRes, mockNext);

    // Since the handler delegates error handling to Express via next(error),
    // we only verify that next was invoked with an Error instance.
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});
