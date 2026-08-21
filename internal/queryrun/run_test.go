package queryrun

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/stretchr/testify/require"
)

func TestRunRawOutputIsStoredAsDynamoDBBinary(t *testing.T) {
	run := &Run{ID: "run-id", RawOutput: []byte{0x00, 0x80, 0xff}}

	item, err := attributevalue.MarshalMap(run)

	require.NoError(t, err)
	value, ok := item["RawOutput"].(*types.AttributeValueMemberB)
	require.True(t, ok)
	require.Equal(t, run.RawOutput, value.Value)
}
