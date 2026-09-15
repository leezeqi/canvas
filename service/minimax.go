package service

import (
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
)

const ModelChannelProtocolMiniMax = "metaso"

func MiniMaxModels() []string {
	return []string{"MiniMax-H3", "MiniMax-Hailuo-2.3", "MiniMax-Hailuo-2.3-Fast", "MiniMax-Hailuo-02", "MiniMax-Hailuo-01"}
}

func IsMiniMaxChannel(channel model.ModelChannel) bool {
	return strings.EqualFold(strings.TrimSpace(channel.Protocol), ModelChannelProtocolMiniMax)
}

func IsMiniMaxH3ModelName(modelName string) bool {
	return strings.EqualFold(strings.TrimSpace(modelName), "MiniMax-H3")
}

func IsMiniMaxHailuoModelName(modelName string) bool {
	value := strings.ToLower(strings.TrimSpace(modelName))
	return strings.HasPrefix(value, "minimax-hailuo-") || strings.HasPrefix(value, "hailuo-")
}
